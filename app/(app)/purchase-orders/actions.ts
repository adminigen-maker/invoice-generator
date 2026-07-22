"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { computeLine, computeTotals } from "@/lib/pricing";

const lineSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  uom_id: z.string().uuid().optional().nullable(),
  unit_price: z.coerce.number().min(0),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  tax_pct: z.coerce.number().min(0).max(100).default(0),
});

const poSchema = z.object({
  vendor_id: z.string().uuid("Vendor required"),
  order_date: z.string().min(1),
  expected_date: z.string().optional().nullable(),
  warehouse_id: z.string().uuid().optional().nullable(),
  currency: z.string().default("AED"),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

type SaveResult = { ok: true; id: string } | { ok: false; error: string };
type Result = { ok: boolean; error?: string };

async function nextNumber() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("next_document_number", { seq_code: "purchase_order" });
  return data as string;
}

async function saveLines(poId: string, lines: z.infer<typeof lineSchema>[]) {
  const supabase = await createClient();
  await supabase.from("purchase_order_line").delete().eq("purchase_order_id", poId);
  const rows = lines.map((l, i) => {
    const t = computeLine({
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      tax_rate: l.tax_pct ?? 0,
    });
    return {
      purchase_order_id: poId,
      sequence: i,
      product_id: l.product_id ?? null,   // linked to master
      uom_id: l.uom_id ?? null,           // linked to master
      tax_id: null,                        // tax is a free % (tax_pct), not a tax_rate link
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      tax_pct: l.tax_pct ?? 0,
      line_subtotal: t.line_subtotal,
      line_discount: t.line_discount,
      line_tax: t.line_tax,
      line_total: t.line_total,
    };
  });
  if (rows.length) await supabase.from("purchase_order_line").insert(rows);
}

export async function savePurchaseOrder(existingId: string | null, input: z.infer<typeof poSchema>): Promise<SaveResult> {
  try {
    await requirePermission(existingId ? P.procurement.poEdit : P.procurement.poCreate);
    const parsed = poSchema.parse(input);
    const supabase = await createClient();
    const totals = computeTotals(parsed.lines.map((l) => ({
      quantity: l.quantity, unit_price: l.unit_price, discount_pct: l.discount_pct, tax_rate: l.tax_pct ?? 0,
    })));

    let id = existingId;
    const header = {
      vendor_id: parsed.vendor_id,
      warehouse_id: parsed.warehouse_id || null,
      order_date: parsed.order_date,
      expected_date: parsed.expected_date || null,
      currency: parsed.currency,
      notes: parsed.notes || null,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      total: totals.total,
    };

    if (!id) {
      const number = await nextNumber();
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("purchase_order")
        .insert({ ...header, number, status: "draft", created_by: user.user?.id })
        .select("id").single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    } else {
      const { error } = await supabase.from("purchase_order").update(header).eq("id", id);
      if (error) return { ok: false, error: error.message };
    }

    await saveLines(id!, parsed.lines);
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${id}`);
    return { ok: true, id: id! };
  } catch (e) {
    return { ok: false, error: err(e, "save purchase orders") };
  }
}

export async function confirmPurchaseOrder(id: string): Promise<Result> {
  try {
    await requirePermission(P.procurement.poConfirm);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("purchase_order").update({ status: "confirmed" }).eq("id", id).eq("status", "draft").select("id");
    if (error) return { ok: false, error: error.message };
    if (!data?.length) return { ok: false, error: "Only draft purchase orders can be confirmed." };
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e, "confirm purchase orders") };
  }
}

/**
 * Receive a confirmed PO. For each line linked to a product, posts a stock move
 * (vendor → stock) so on-hand ACCUMULATES (2 on hand + receive 10 = 12), and
 * records the product's last purchase price/date SEPARATELY (never overwrites
 * the master cost_price). Free-text lines with no product don't affect stock.
 */
export async function receivePurchaseOrder(id: string): Promise<Result> {
  try {
    await requirePermission(P.procurement.poReceive);
    const supabase = await createClient();

    const { data: po } = await supabase
      .from("purchase_order")
      .select("id, number, status, warehouse_id, lines:purchase_order_line(id, product_id, uom_id, quantity, unit_price)")
      .eq("id", id).maybeSingle();
    if (!po) return { ok: false, error: "Purchase order not found." };
    if (po.status !== "confirmed") return { ok: false, error: "Only confirmed purchase orders can be received." };

    const lines = (po.lines ?? []) as Array<{ id: string; product_id: string | null; uom_id: string | null; quantity: number; unit_price: number }>;
    const productLines = lines.filter((l) => l.product_id);

    // Idempotency: if this PO already posted stock (e.g. a receive that ran the
    // stock-move insert but failed on the old invalid 'received' status), never
    // post it a second time — that would double the on-hand quantity.
    const { data: existingMoves } = await supabase
      .from("stock_move")
      .select("id")
      .eq("reference_type", "purchase_order")
      .eq("reference_id", po.id)
      .limit(1);
    const alreadyPosted = (existingMoves?.length ?? 0) > 0;

    if (productLines.length && !alreadyPosted) {
      const stockQ = supabase.from("location").select("id").eq("kind", "stock");
      if (po.warehouse_id) stockQ.eq("warehouse_id", po.warehouse_id);
      const [{ data: stockLoc }, { data: vendLoc }] = await Promise.all([
        stockQ.limit(1).maybeSingle(),
        supabase.from("location").select("id").eq("kind", "vendor").limit(1).maybeSingle(),
      ]);
      if (!stockLoc) return { ok: false, error: "No stock location is configured to receive into." };

      const { data: user } = await supabase.auth.getUser();
      const today = new Date().toISOString().slice(0, 10);
      const moves = productLines.map((l) => ({
        product_id: l.product_id,
        uom_id: l.uom_id,
        quantity: Number(l.quantity),
        source_location_id: vendLoc?.id ?? null,
        dest_location_id: stockLoc.id,
        reference_type: "purchase_order",
        reference_id: po.id,
        unit_cost: Number(l.unit_price),
        move_date: today,
        notes: `Received ${po.number}`,
        created_by: user.user?.id,
      }));
      const { error: moveErr } = await supabase.from("stock_move").insert(moves);
      if (moveErr) {
        return {
          ok: false,
          error: /permission|policy|row-level/i.test(moveErr.message)
            ? "You don't have permission to post stock (needs the receipt permission)."
            : moveErr.message,
        };
      }

      // Record last purchase price/date on each product — SEPARATE from cost_price.
      for (const l of productLines) {
        await supabase.from("product").update({ last_purchase_price: Number(l.unit_price), last_purchase_date: today }).eq("id", l.product_id);
      }
    }

    for (const l of lines) {
      await supabase.from("purchase_order_line").update({ quantity_received: l.quantity }).eq("id", l.id);
    }
    const { error: upErr } = await supabase
      .from("purchase_order").update({ status: "received", received_at: new Date().toISOString() }).eq("id", id);
    if (upErr) return { ok: false, error: upErr.message };

    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${id}`);
    revalidatePath("/inventory");
    revalidatePath("/products");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e, "receive purchase orders") };
  }
}

export async function cancelPurchaseOrder(id: string): Promise<Result> {
  try {
    await requirePermission(P.procurement.poCancel);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("purchase_order").update({ status: "cancelled" }).eq("id", id).in("status", ["draft", "confirmed"]).select("id");
    if (error) return { ok: false, error: error.message };
    if (!data?.length) return { ok: false, error: "Only draft or confirmed purchase orders can be cancelled." };
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e, "cancel purchase orders") };
  }
}

export async function deletePurchaseOrder(id: string): Promise<Result> {
  try {
    await requirePermission(P.procurement.poDelete);
    const supabase = await createClient();
    const { data: row } = await supabase.from("purchase_order").select("status").eq("id", id).maybeSingle();
    if (row && !["draft", "cancelled"].includes((row as { status: string }).status)) {
      return { ok: false, error: "This purchase order can't be deleted in its current state. Cancel it instead." };
    }
    const { data, error } = await supabase.from("purchase_order").delete().eq("id", id).select("id");
    if (error) return { ok: false, error: error.message };
    if (!data?.length) return { ok: false, error: "This purchase order wasn't deleted — it may be outside your access scope." };
    revalidatePath("/purchase-orders");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e, "delete purchase orders") };
  }
}

function err(e: unknown, action: string): string {
  if ((e as { code?: string })?.code === "PERMISSION_DENIED") return `You don't have permission to ${action}.`;
  if (e instanceof z.ZodError) return e.issues[0].message;
  return (e as Error)?.message ?? "Something went wrong";
}
