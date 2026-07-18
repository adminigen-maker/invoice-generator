"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils";
import { recordPayment } from "@/app/(app)/invoices/actions";

export type OpenInvoice = { id: string; number: string; balance: number; currency: string; customer: string };

export function RecordPaymentButton({ invoices }: { invoices: OpenInvoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");

  const selected = invoices.find((i) => i.id === invoiceId);

  function pickInvoice(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) setAmount(inv.balance.toFixed(2));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId) {
      toast.error("Pick an invoice first");
      return;
    }
    setSaving(true);
    const res = await recordPayment({
      invoice_id: invoiceId,
      amount: Number(amount),
      payment_date: date,
      method,
      reference: reference || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Payment recorded");
    setOpen(false);
    setInvoiceId("");
    setAmount("");
    setReference("");
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={invoices.length === 0} title={invoices.length === 0 ? "No open invoices" : undefined}>
        <Plus className="h-4 w-4 mr-2" />Record payment
      </Button>
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Record payment"
        description="Allocate a receipt to an open invoice. Partial amounts are fine."
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Invoice <span className="text-destructive">*</span></Label>
            <select
              value={invoiceId}
              onChange={(e) => pickInvoice(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— select an open invoice —</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} — {i.customer} (balance {formatMoney(i.balance, i.currency)})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount{selected ? ` (max ${formatMoney(selected.balance, selected.currency)})` : ""}</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={selected?.balance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (partial ok)"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / cheque no." />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record payment
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
