"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { computeLine, computeTotals } from "@/lib/pricing";
import { quotationApprovalRules } from "@/lib/workflows/approvals";

const lineSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  uom_id: z.string().uuid().optional().nullable(),
  unit_price: z.coerce.number().min(0),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  tax_id: z.string().uuid().optional().nullable(),
});

const quotationSchema = z.object({
  customer_id: z.string().uuid("Customer required"),
  quote_date: z.string().min(1),
  valid_until: z.string().optional().nullable(),
  currency: z.string().default("AED"),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function nextNumber(code: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("next_document_number", { seq_code: code });
  return data as string;
}

async function taxRateLookup(ids: (string | null | undefined)[]): Promise<Map<string, number>> {
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (!uniq.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("tax_rate").select("id, rate").in("id", uniq);
  const m = new Map<string, number>();
  for (const t of data ?? []) m.set(t.id, Number(t.rate));
  return m;
}

/** Persist lines: delete then re-insert. Fine for MVP; small line counts. */
async function saveLines(quotationId: string, lines: z.infer<typeof lineSchema>[], taxMap: Map<string, number>) {
  const supabase = await createClient();
  await supabase.from("quotation_line").delete().eq("quotation_id", quotationId);
  const rows = lines.map((l, i) => {
    const t = computeLine({
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      tax_rate: l.tax_id ? taxMap.get(l.tax_id) ?? 0 : 0,
    });
    return {
      quotation_id: quotationId,
      sequence: i,
      product_id: l.product_id ?? null,
      description: l.description,
      quantity: l.quantity,
      uom_id: l.uom_id ?? null,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      tax_id: l.tax_id ?? null,
      line_subtotal: t.line_subtotal,
      line_discount: t.line_discount,
      line_tax: t.line_tax,
      line_total: t.line_total,
    };
  });
  if (rows.length) await supabase.from("quotation_line").insert(rows);
}

function computeHeaderTotals(lines: z.infer<typeof lineSchema>[], taxMap: Map<string, number>) {
  return computeTotals(lines.map((l) => ({
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount_pct: l.discount_pct,
    tax_rate: l.tax_id ? taxMap.get(l.tax_id) ?? 0 : 0,
  })));
}

export async function saveQuotation(
  existingId: string | null,
  input: z.infer<typeof quotationSchema>
): Promise<ActionResult> {
  try {
    await requirePermission(existingId ? P.sales.quotationEdit : P.sales.quotationCreate);
    const parsed = quotationSchema.parse(input);
    const supabase = await createClient();

    const taxMap = await taxRateLookup(parsed.lines.map((l) => l.tax_id));
    const totals = computeHeaderTotals(parsed.lines, taxMap);

    let id = existingId;
    if (!id) {
      const number = await nextNumber("quotation");
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("quotation")
        .insert({
          number,
          customer_id: parsed.customer_id,
          quote_date: parsed.quote_date,
          valid_until: parsed.valid_until,
          currency: parsed.currency,
          notes: parsed.notes,
          terms: parsed.terms,
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          tax_total: totals.tax_total,
          total: totals.total,
          status: "draft",
          created_by: user.user?.id,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    } else {
      const { error } = await supabase
        .from("quotation")
        .update({
          customer_id: parsed.customer_id,
          quote_date: parsed.quote_date,
          valid_until: parsed.valid_until,
          currency: parsed.currency,
          notes: parsed.notes,
          terms: parsed.terms,
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          tax_total: totals.tax_total,
          total: totals.total,
        })
        .eq("id", id);
      if (error) return { ok: false, error: error.message };
    }

    await saveLines(id!, parsed.lines, taxMap);
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    return { ok: true, id: id! };
  } catch (e) {
    if ((e as { code?: string }).code === "PERMISSION_DENIED")
      return { ok: false, error: "Permission denied." };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Confirm quotation → create Sales Order. Runs the approval engine first;
 * if approval is required, the caller must have `sales.quotation.confirm`
 * to bypass (Sales Manager) or the quotation is bounced back with a reason.
 */
export async function confirmQuotation(id: string): Promise<ActionResult> {
  try {
    await requirePermission(P.sales.quotationConfirm);
    const supabase = await createClient();
    const { data: q, error: qErr } = await supabase
      .from("quotation")
      .select("*, lines:quotation_line(*)")
      .eq("id", id)
      .maybeSingle();
    if (qErr || !q) return { ok: false, error: qErr?.message ?? "Not found" };

    const approval = quotationApprovalRules({
      discount_total: Number(q.discount_total ?? 0),
      total: Number(q.total ?? 0),
    });
    // Confirm perm effectively grants Sales Manager approval authority.
    // Downstream: swap this for a proper approval-record system.
    if (approval.required) {
      // permission-holder is allowed to confirm; log the override.
      await supabase.from("audit_log").insert({
        table_name: "quotation",
        record_id: id,
        action: "update",
        changes: { approval_override: approval },
      });
    }

    const soNumber = await nextNumber("sales_order");
    const { data: so, error: soErr } = await supabase
      .from("sales_order")
      .insert({
        number: soNumber,
        quotation_id: id,
        customer_id: q.customer_id,
        currency: q.currency,
        subtotal: q.subtotal,
        discount_total: q.discount_total,
        tax_total: q.tax_total,
        total: q.total,
        notes: q.notes,
        status: "confirmed",
        created_by: q.created_by,
      })
      .select("id")
      .single();
    if (soErr) return { ok: false, error: soErr.message };

    const soLines = (q.lines ?? []).map((l: {
      id: string; sequence: number; product_id: string | null; description: string;
      uom_id: string | null; quantity: number; unit_price: number; discount_pct: number;
      tax_id: string | null; line_subtotal: number; line_discount: number;
      line_tax: number; line_total: number;
    }) => ({
      sales_order_id: so.id,
      quotation_line_id: l.id,
      sequence: l.sequence,
      product_id: l.product_id,
      description: l.description,
      uom_id: l.uom_id,
      quantity_ordered: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      tax_id: l.tax_id,
      line_subtotal: l.line_subtotal,
      line_discount: l.line_discount,
      line_tax: l.line_tax,
      line_total: l.line_total,
    }));
    if (soLines.length) await supabase.from("sales_order_line").insert(soLines);

    await supabase.from("quotation").update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    }).eq("id", id);

    revalidatePath("/quotations");
    revalidatePath("/sales-orders");
    redirect(`/sales-orders/${so.id}`);
  } catch (e) {
    if ((e as { code?: string }).code === "PERMISSION_DENIED")
      return { ok: false, error: "You don't have permission to confirm quotations." };
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteQuotation(id: string) {
  await requirePermission(P.sales.quotationDelete);
  const supabase = await createClient();
  await supabase.from("quotation").delete().eq("id", id);
  revalidatePath("/quotations");
  redirect("/quotations");
}
