"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";

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

  const number = await nextNumber("delivery_note");
  const { data: warehouse } = await supabase.from("warehouse").select("id").limit(1).maybeSingle();
  const { data: user } = await supabase.auth.getUser();

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

  const number = await nextNumber("invoice");
  const { data: user } = await supabase.auth.getUser();

  const { data: cust } = await supabase.from("customer").select("payment_terms_days").eq("id", so.customer_id).maybeSingle();
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

  // Recompute per-line totals proportionally to the remaining qty.
  const lines = invoiceable.map(({ l, remaining }, i) => {
    const gross = remaining * Number(l.unit_price);
    const discount = gross * Number(l.discount_pct) / 100;
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
      line_subtotal: Math.round((gross + Number.EPSILON) * 100) / 100,
      line_discount: Math.round((discount + Number.EPSILON) * 100) / 100,
      // Tax is recomputed by a follow-up update once tax_id → rate is resolved (kept simple for MVP).
      line_tax: 0,
      line_total: Math.round(((gross - discount) + Number.EPSILON) * 100) / 100,
    };
  });
  await supabase.from("invoice_line").insert(lines);

  // Re-fetch with tax rates and recompute for correctness.
  const { data: withTax } = await supabase
    .from("invoice_line")
    .select("id, quantity, unit_price, discount_pct, tax:tax_rate(rate)")
    .eq("invoice_id", inv.id);
  let subtotal = 0, discountTotal = 0, taxTotal = 0, total = 0;
  for (const l of withTax ?? []) {
    const gross = Number(l.quantity) * Number(l.unit_price);
    const discount = gross * Number(l.discount_pct) / 100;
    const taxable = gross - discount;
    const rate = Number((l.tax as { rate?: number } | null)?.rate ?? 0);
    const tax = taxable * rate / 100;
    subtotal += gross;
    discountTotal += discount;
    taxTotal += tax;
    total += taxable + tax;
    await supabase.from("invoice_line").update({
      line_tax: Math.round((tax + Number.EPSILON) * 100) / 100,
      line_total: Math.round(((taxable + tax) + Number.EPSILON) * 100) / 100,
    }).eq("id", l.id);
  }
  await supabase.from("invoice").update({
    subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100,
    discount_total: Math.round((discountTotal + Number.EPSILON) * 100) / 100,
    tax_total: Math.round((taxTotal + Number.EPSILON) * 100) / 100,
    total: Math.round((total + Number.EPSILON) * 100) / 100,
  }).eq("id", inv.id);

  revalidatePath("/sales-orders");
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}`);
}
