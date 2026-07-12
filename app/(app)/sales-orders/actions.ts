"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { computeLine } from "@/lib/pricing";
import { cancelDocument, deleteDocument } from "@/lib/db/doc-lifecycle";

export async function cancelSalesOrder(id: string) {
  return cancelDocument("sales_order", P.sales.orderEdit, "/sales-orders", id);
}

export async function deleteSalesOrder(id: string) {
  return deleteDocument("sales_order", P.sales.orderDelete, "/sales-orders", id);
}

async function nextNumber(code: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("next_document_number", { seq_code: code });
  return data as string;
}

/**
 * Create a Delivery Note that consumes the outstanding (not-yet-delivered)
 * quantity on each Sales Order line. Header status transitions on the SO
 * are derived downstream from the line rollups (trigger keeps them in sync).
 */
export async function createDeliveryNoteFromSO(salesOrderId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission(P.inventory.deliveryCreate);
  const supabase = await createClient();

  const { data: so } = await supabase
    .from("sales_order")
    .select("id, number, customer_id, lines:sales_order_line(*)")
    .eq("id", salesOrderId)
    .maybeSingle();
  if (!so) return { ok: false, error: "Sales order not found" };

  const outstanding = (so.lines ?? []).filter((l: { quantity_ordered: number; quantity_delivered: number }) =>
    Number(l.quantity_ordered) - Number(l.quantity_delivered) > 0
  );
  if (!outstanding.length) return { ok: false, error: "Nothing left to deliver" };

  // Independent reads — run together instead of three serial round trips.
  const [number, { data: warehouse }, { data: user }] = await Promise.all([
    nextNumber("delivery_note"),
    supabase.from("warehouse").select("id").limit(1).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const { data: dn, error } = await supabase
    .from("delivery_note")
    .insert({
      number,
      sales_order_id: salesOrderId,
      warehouse_id: warehouse?.id,
      status: "draft",
      created_by: user.user?.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const rows = outstanding.map((l: {
    id: string; product_id: string | null; uom_id: string | null;
    quantity_ordered: number; quantity_delivered: number;
  }) => ({
    delivery_note_id: dn.id,
    sales_order_line_id: l.id,
    product_id: l.product_id,
    uom_id: l.uom_id,
    quantity: Number(l.quantity_ordered) - Number(l.quantity_delivered),
  }));
  await supabase.from("delivery_note_line").insert(rows);

  revalidatePath("/sales-orders");
  revalidatePath("/delivery-notes");
  redirect(`/delivery-notes/${dn.id}`);
}

/**
 * One-click: create a Delivery Note (posted → issues stock) AND an Invoice for
 * the outstanding sales-order quantities. The invoice lines are linked to the
 * delivery-note lines, so stock is deducted exactly once (the invoice won't
 * re-issue it). Returns both ids; the caller stays on the SO to show them.
 */
export async function createDeliveryAndInvoiceFromSO(
  salesOrderId: string
): Promise<{ ok: true; deliveryNoteId: string; invoiceId: string } | { ok: false; error: string }> {
  try {
    await requirePermission(P.inventory.deliveryCreate);
    await requirePermission(P.invoice.create);
    const supabase = await createClient();

    const { data: so } = await supabase.from("sales_order").select("*, lines:sales_order_line(*)").eq("id", salesOrderId).maybeSingle();
    if (!so) return { ok: false, error: "Sales order not found" };

    type SoLine = { id: string; product_id: string | null; uom_id: string | null; description: string; quantity_ordered: number; quantity_delivered: number; unit_price: number; discount_pct: number; tax_id: string | null };
    const outstanding = ((so.lines ?? []) as SoLine[])
      .map((l) => ({ l, qty: Number(l.quantity_ordered) - Number(l.quantity_delivered) }))
      .filter((x) => x.qty > 0);
    if (!outstanding.length) return { ok: false, error: "Nothing left to deliver/invoice on this order." };

    const [dnNumber, invNumber, { data: warehouse }, { data: user }, { data: cust }] = await Promise.all([
      nextNumber("delivery_note"),
      nextNumber("invoice"),
      supabase.from("warehouse").select("id").limit(1).maybeSingle(),
      supabase.auth.getUser(),
      supabase.from("customer").select("payment_terms_days").eq("id", so.customer_id).maybeSingle(),
    ]);

    // Delivery note + lines
    const { data: dn, error: dnErr } = await supabase.from("delivery_note")
      .insert({ number: dnNumber, sales_order_id: salesOrderId, warehouse_id: warehouse?.id, status: "draft", created_by: user.user?.id })
      .select("id").single();
    if (dnErr) return { ok: false, error: dnErr.message };
    const { data: dnLines, error: dnlErr } = await supabase.from("delivery_note_line")
      .insert(outstanding.map(({ l, qty }) => ({ delivery_note_id: dn.id, sales_order_line_id: l.id, product_id: l.product_id, uom_id: l.uom_id, quantity: qty })))
      .select("id, sales_order_line_id");
    if (dnlErr) return { ok: false, error: dnlErr.message };
    const dnLineBySoLine = new Map((dnLines ?? []).map((d: { id: string; sales_order_line_id: string }) => [d.sales_order_line_id, d.id]));

    // Post the delivery note → issues stock (warehouse → customer)
    const { error: postErr } = await supabase.from("delivery_note").update({ posted_at: new Date().toISOString(), status: "delivered" }).eq("id", dn.id);
    if (postErr) return { ok: false, error: postErr.message };

    // Invoice + lines (linked to DN lines so stock isn't deducted a second time)
    const taxIds = Array.from(new Set(outstanding.map(({ l }) => l.tax_id).filter(Boolean))) as string[];
    const taxRates = new Map<string, number>();
    if (taxIds.length) {
      const { data: tr } = await supabase.from("tax_rate").select("id, rate").in("id", taxIds);
      for (const t of (tr ?? []) as Array<{ id: string; rate: number }>) taxRates.set(t.id, Number(t.rate));
    }
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Number(cust?.payment_terms_days ?? 30));

    const { data: inv, error: invErr } = await supabase.from("invoice")
      .insert({ number: invNumber, sales_order_id: salesOrderId, customer_id: so.customer_id, currency: so.currency, due_date: dueDate.toISOString().slice(0, 10), status: "draft", created_by: user.user?.id })
      .select("id").single();
    if (invErr) return { ok: false, error: invErr.message };

    const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
    let subtotal = 0, discountTotal = 0, taxTotal = 0, total = 0;
    const invLines = outstanding.map(({ l, qty }, i) => {
      const t = computeLine({ quantity: qty, unit_price: l.unit_price, discount_pct: l.discount_pct, tax_rate: l.tax_id ? taxRates.get(l.tax_id) ?? 0 : 0 });
      subtotal += t.line_subtotal; discountTotal += t.line_discount; taxTotal += t.line_tax; total += t.line_total;
      return {
        invoice_id: inv.id, sales_order_line_id: l.id, delivery_note_line_id: dnLineBySoLine.get(l.id) ?? null,
        sequence: i, product_id: l.product_id, description: l.description, quantity: qty, uom_id: l.uom_id,
        unit_price: l.unit_price, discount_pct: l.discount_pct, tax_id: l.tax_id,
        line_subtotal: t.line_subtotal, line_discount: t.line_discount, line_tax: t.line_tax, line_total: t.line_total,
      };
    });
    await supabase.from("invoice_line").insert(invLines);
    await supabase.from("invoice").update({ subtotal: round2(subtotal), discount_total: round2(discountTotal), tax_total: round2(taxTotal), total: round2(total) }).eq("id", inv.id);

    revalidatePath("/sales-orders");
    revalidatePath(`/sales-orders/${salesOrderId}`);
    revalidatePath("/delivery-notes");
    revalidatePath("/invoices");
    revalidatePath("/inventory");
    return { ok: true, deliveryNoteId: dn.id, invoiceId: inv.id };
  } catch (e) {
    if ((e as { code?: string })?.code === "PERMISSION_DENIED") return { ok: false, error: "You don't have permission for this." };
    return { ok: false, error: (e as Error)?.message ?? "Failed" };
  }
}

/** Create Invoice for all sales-order lines that have been delivered but not yet invoiced. */
export async function createInvoiceFromSO(salesOrderId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission(P.invoice.create);
  const supabase = await createClient();

  const { data: so } = await supabase
    .from("sales_order")
    .select("*, lines:sales_order_line(*)")
    .eq("id", salesOrderId)
    .maybeSingle();
  if (!so) return { ok: false, error: "Sales order not found" };

  const invoiceable = (so.lines ?? []).map((l: {
    id: string; sequence: number; product_id: string | null; description: string;
    uom_id: string | null; quantity_ordered: number; quantity_delivered: number; quantity_invoiced: number;
    unit_price: number; discount_pct: number; tax_id: string | null;
    line_subtotal: number; line_discount: number; line_tax: number; line_total: number;
  }) => {
    const remaining = Number(l.quantity_delivered) - Number(l.quantity_invoiced);
    return remaining > 0 ? { l, remaining } : null;
  }).filter(Boolean) as Array<{ l: { id: string; sequence: number; product_id: string | null; description: string; uom_id: string | null; unit_price: number; discount_pct: number; tax_id: string | null }; remaining: number }>;

  if (!invoiceable.length) return { ok: false, error: "Nothing delivered yet to invoice" };

  // Resolve tax rates + the independent reads all at once (was 3 serial hops).
  const taxIds = Array.from(
    new Set(invoiceable.map(({ l }) => l.tax_id).filter(Boolean))
  ) as string[];
  const [number, { data: user }, { data: cust }, taxRes] = await Promise.all([
    nextNumber("invoice"),
    supabase.auth.getUser(),
    supabase.from("customer").select("payment_terms_days").eq("id", so.customer_id).maybeSingle(),
    taxIds.length
      ? supabase.from("tax_rate").select("id, rate").in("id", taxIds)
      : Promise.resolve({ data: [] as Array<{ id: string; rate: number }> }),
  ]);
  const taxRates = new Map<string, number>();
  for (const t of (taxRes.data ?? []) as Array<{ id: string; rate: number }>) {
    taxRates.set(t.id, Number(t.rate));
  }
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + Number(cust?.payment_terms_days ?? 30));

  const { data: inv, error } = await supabase
    .from("invoice")
    .insert({
      number,
      sales_order_id: salesOrderId,
      customer_id: so.customer_id,
      currency: so.currency,
      due_date: dueDate.toISOString().slice(0, 10),
      status: "draft",
      created_by: user.user?.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Compute every line fully in memory (tax rates already resolved above),
  // insert once, and update the header once — no refetch, no per-line update
  // loop. Was 1 insert + 1 refetch + N serial updates; now just 2 writes.
  const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
  let subtotal = 0, discountTotal = 0, taxTotal = 0, total = 0;
  const lines = invoiceable.map(({ l, remaining }, i) => {
    const t = computeLine({
      quantity: remaining,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      tax_rate: l.tax_id ? taxRates.get(l.tax_id) ?? 0 : 0,
    });
    subtotal += t.line_subtotal;
    discountTotal += t.line_discount;
    taxTotal += t.line_tax;
    total += t.line_total;
    return {
      invoice_id: inv.id,
      sales_order_line_id: l.id,
      sequence: i,
      product_id: l.product_id,
      description: l.description,
      quantity: remaining,
      uom_id: l.uom_id,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      tax_id: l.tax_id,
      line_subtotal: t.line_subtotal,
      line_discount: t.line_discount,
      line_tax: t.line_tax,
      line_total: t.line_total,
    };
  });
  await supabase.from("invoice_line").insert(lines);
  await supabase.from("invoice").update({
    subtotal: round2(subtotal),
    discount_total: round2(discountTotal),
    tax_total: round2(taxTotal),
    total: round2(total),
  }).eq("id", inv.id);

  revalidatePath("/sales-orders");
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}`);
}
