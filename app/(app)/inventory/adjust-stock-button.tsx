"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adjustStock } from "./actions";

export function AdjustStockButton({
  productId,
  name,
  currentQty,
  uom,
}: {
  productId: string;
  name: string;
  currentQty: number;
  uom: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qty, setQty] = useState(currentQty.toFixed(2));
  const [reason, setReason] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await adjustStock(productId, Number(qty), reason || null);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Stock updated");
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={() => { setQty(currentQty.toFixed(2)); setOpen(true); }}>
        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Adjust
      </Button>
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        title={`Adjust stock — ${name}`}
        description="Enter the actual quantity on hand. We'll record the difference as a stock adjustment."
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Current on hand: <span className="font-mono font-medium text-foreground">{currentQty.toFixed(2)} {uom ?? ""}</span>
          </div>
          <div className="space-y-1.5">
            <Label>New quantity on hand {uom ? `(${uom})` : ""}</Label>
            <Input type="number" step="0.01" min="0" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opening balance, stock count, damage…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save adjustment
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
