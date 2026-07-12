"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { computeLine, computeTotals } from "@/lib/pricing";
import { cancelDocument, deleteDocument } from "@/lib/db/doc-lifecycle";

const invoiceLineSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  uom_id: z.string().uuid().optional().nullable(),
  unit_price: z.coerce.number().min(0),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  tax_id: z.string().uuid().optional().nullable(),
});

const invoiceSchema = z.object({
  customer_id: z.string().uuid("Customer required"),
  invoice_date: z.string().min(1),
  due_date: z.string().optional().nullable(),
  currency: z.string().default("AED"),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line"),
});

/**
 * Create a standalone invoice (not tied to a sales order) in DRAFT state.
 * Posting it later (postInvoice) is what issues stock and finalizes AR.
 */
export async function createInvoice(
  input: z.infer<typeof invoiceSchema>
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await requirePermission(P.invoice.create);
    const parsed = invoiceSchema.parse(input);
    const supabase = await createClient();

    const taxIds = Array.from(new Set(parsed.lines.map((l) => l.tax_id).filter(Boolean))) as string[];
    const taxMap = new Map<string, number>();
    if (taxIds.length) {
      const { data: taxes } = await supabase.from("tax_rate").select("id, rate").in("id", taxIds);
      for (const t of taxes ?? []) taxMap.set(t.id, Number(t.rate));
    }
    const rateOf = (id?: string | null) => (id ? taxMap.get(id) ?? 0 : 0);

    const totals = computeTotals(
      parsed.lines.map((l) => ({
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        tax_rate: rateOf(l.tax_id),
      }))
    );

    const { data: numData } = await supabase.rpc("next_document_number", { seq_code: "invoice" });
    const { data: user } = await supabase.auth.getUser();

    const { data: inv, error: invErr } = await supabase
      .from("invoice")
      .insert({
        number: numData as string,
        customer_id: parsed.customer_id,
        invoice_date: parsed.invoice_date,
        due_date: parsed.due_date || null,
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
    if (invErr) return { ok: false, error: invErr.message };

    const rows = parsed.lines.map((l, i) => {
      const t = computeLine({
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        tax_rate: rateOf(l.tax_id),
      });
      return {
        invoice_id: inv.id,
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
    if (rows.length) {
      const { error: lineErr } = await supabase.from("invoice_line").insert(rows);
      if (lineErr) return { ok: false, error: lineErr.message };
    }

    revalidatePath("/invoices");
    return { ok: true, id: inv.id };
  } catch (e) {
    if ((e as { code?: string }).code === "PERMISSION_DENIED")
      return { ok: false, error: "You don't have permission to create invoices." };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    return { ok: false, error: (e as Error).message };
  }
}

export async function cancelInvoice(id: string) {
  return cancelDocument("invoice", P.invoice.edit, "/invoices", id);
}

export async function deleteInvoice(id: string) {
  return deleteDocument("invoice", P.invoice.void, "/invoices", id);
}

export async function postInvoice(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission(P.invoice.post);
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice")
    .update({ posted_at: new Date().toISOString(), status: "invoiced" })
    .eq("id", id)
    .is("posted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

export async function recordPayment(input: {
  invoice_id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePermission(P.invoice.paymentCreate);
  const supabase = await createClient();

  // Invoice read + user are independent — fetch together. The payment number
  // is drawn only AFTER validation passes, so a rejected payment never burns a
  // sequence number (gaps matter for financial documents).
  const [{ data: inv }, { data: user }] = await Promise.all([
    supabase
      .from("invoice")
      .select("id, customer_id, currency, balance, number")
      .eq("id", input.invoice_id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!inv) return { ok: false, error: "Invoice not found" };

  if (input.amount > Number(inv.balance) + 0.001) {
    return { ok: false, error: `Amount exceeds outstanding balance (${inv.balance})` };
  }

  const { data: numData } = await supabase.rpc("next_document_number", { seq_code: "payment" });
  const number = numData as string;

  const { data: payment, error } = await supabase
    .from("payment")
    .insert({
      number,
      customer_id: inv.customer_id,
      payment_date: input.payment_date,
      method: input.method,
      reference: input.reference ?? null,
      currency: inv.currency,
      amount: input.amount,
      amount_unallocated: input.amount,   // will be zeroed by allocation trigger
      created_by: user.user?.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await supabase.from("payment_allocation").insert({
    payment_id: payment.id,
    invoice_id: input.invoice_id,
    amount_allocated: input.amount,
  });

  // Update invoice status based on new balance.
  const { data: refreshed } = await supabase
    .from("invoice")
    .select("total, amount_paid")
    .eq("id", input.invoice_id)
    .single();
  const isPaid = Number(refreshed?.amount_paid ?? 0) >= Number(refreshed?.total ?? 0) - 0.001;
  const isPartial = Number(refreshed?.amount_paid ?? 0) > 0 && !isPaid;
  await supabase
    .from("invoice")
    .update({ status: isPaid ? "paid" : isPartial ? "partially_paid" : "invoiced" })
    .eq("id", input.invoice_id);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${input.invoice_id}`);
  revalidatePath("/payments");
  return { ok: true, id: payment.id };
}
