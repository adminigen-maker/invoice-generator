"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils";
import { createCreditNote } from "../actions";

export type ReturnableLine = {
  id: string;
  description: string;
  quantity: number;   // originally invoiced
  credited: number;   // already returned
  unit_price: number;
};

/**
 * Customer return, raised straight from the invoice. Pick the lines and
 * quantities that came back; the credit reduces this invoice's balance and the
 * goods go back into stock. The invoice itself is left untouched.
 */
export function ReturnCreditButton({
  invoiceId, currency, lines,
}: { invoiceId: string; currency: string; lines: ReturnableLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const remainingOf = (l: ReturnableLine) => Number(l.quantity) - Number(l.credited);
  const returnable = lines.filter((l) => remainingOf(l) > 0.0001);

  const creditTotal = returnable.reduce((s, l) => s + (Number(qty[l.id]) || 0) * Number(l.unit_price), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const returns = returnable
      .map((l) => ({ invoice_line_id: l.id, quantity: Number(qty[l.id]) || 0 }))
      .filter((r) => r.quantity > 0);
    if (!returns.length) {
      toast.error("Enter a quantity to return");
      return;
    }
    setSaving(true);
    const res = await createCreditNote(invoiceId, returns, reason || null);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Return recorded — balance reduced and stock returned");
    setOpen(false);
    setQty({});
    setReason("");
    router.refresh();
  }

  if (!returnable.length) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Undo2 className="h-4 w-4 mr-2" />Return / Credit
      </Button>
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Record a return"
        description="Enter what came back. This credits the invoice and returns the goods to stock."
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-md border divide-y">
            {returnable.map((l) => {
              const rem = remainingOf(l);
              return (
                <div key={l.id} className="p-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{l.description}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatMoney(l.unit_price, currency)} each · {rem} of {l.quantity} still returnable
                    </div>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={rem}
                    value={qty[l.id] ?? ""}
                    onChange={(e) => setQty((p) => ({ ...p, [l.id]: e.target.value }))}
                    placeholder="0"
                    className="h-9 w-24 text-right"
                  />
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged, wrong item, customer changed mind…" />
          </div>

          <div className="flex items-center justify-between text-sm border-t pt-3">
            <span className="text-muted-foreground">Credit (excl. VAT)</span>
            <span className="font-mono font-medium">{formatMoney(creditTotal, currency)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record return
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
