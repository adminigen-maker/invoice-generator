"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { postInvoice, recordPayment, cancelInvoice } from "../actions";

export function CancelInvoiceButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4 mr-2" />Cancel
      </Button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Cancel this invoice?"
        description="Its status becomes “Cancelled”. Only draft invoices can be cancelled."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Keep it</Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTx(async () => {
                const res = await cancelInvoice(id);
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success("Invoice cancelled");
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel invoice
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function PostInvoiceButton({ id }: { id: string }) {
  const [pending, startTx] = useTransition();
  return (
    <Button
      onClick={() =>
        startTx(async () => {
          const res = await postInvoice(id);
          if (!res.ok) toast.error(res.error ?? "Failed");
          else toast.success("Invoice posted");
        })
      }
      disabled={pending}
    >
      <CheckCircle2 className="h-4 w-4 mr-2" />
      {pending ? "Posting…" : "Post invoice"}
    </Button>
  );
}

export function RecordPaymentForm({
  invoiceId, balance, currency,
}: { invoiceId: string; balance: number; currency: string }) {
  const [pending, startTx] = useTransition();
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTx(async () => {
          const res = await recordPayment({
            invoice_id: invoiceId,
            amount: Number(amount),
            payment_date: date,
            method,
            reference: reference || null,
          });
          if (!res.ok) toast.error(res.error);
          else toast.success("Payment recorded");
        });
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Amount ({currency})</Label>
          <Input type="number" step="0.01" min="0" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Method</Label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
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
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Recording…" : "Record payment"}
      </Button>
    </form>
  );
}
