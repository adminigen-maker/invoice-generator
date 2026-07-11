"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";

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

  const { data: inv } = await supabase
    .from("invoice")
    .select("id, customer_id, currency, balance, number")
    .eq("id", input.invoice_id)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found" };

  if (input.amount > Number(inv.balance) + 0.001) {
    return { ok: false, error: `Amount exceeds outstanding balance (${inv.balance})` };
  }

  const { data: numData } = await supabase.rpc("next_document_number", { seq_code: "payment" });
  const number = numData as string;
  const { data: user } = await supabase.auth.getUser();

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
