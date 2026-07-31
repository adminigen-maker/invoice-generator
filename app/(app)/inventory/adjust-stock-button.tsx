"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { adjustStock } from "./actions";

type Unit = { uom_id: string; factor: number; label: string };

/** Trim trailing zeros: 2.00 → "2", 2.50 → "2.5". */
const tidy = (n: number) => String(Number(n.toFixed(4)));

export function AdjustStockButton({
  productId,
  name,
  currentQty, // in BASE units
  uom,
  units,
}: {
  productId: string;
  name: string;
  currentQty: number;
  uom: string | null;
  units: Unit[];
}) {
  const router = useRouter();
  // Always have at least the base unit to adjust in.
  const unitList: Unit[] = units.length ? units : [{ uom_id: "base", factor: 1, label: uom ?? "unit" }];
  const baseCode = unitList[0]?.label ?? uom ?? "";

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unitId, setUnitId] = useState(unitList[0].uom_id);
  const [qty, setQty] = useState(tidy(currentQty)); // quantity in the SELECTED unit
  const [reason, setReason] = useState("");

  const factor = unitList.find((u) => u.uom_id === unitId)?.factor ?? 1;
  const code = unitList.find((u) => u.uom_id === unitId)?.label ?? baseCode;
  const newBaseQty = (Number(qty) || 0) * factor;

  function openDialog() {
    setUnitId(unitList[0].uom_id);
    setQty(tidy(currentQty)); // base unit, factor 1
    setOpen(true);
  }

  // Switching unit re-expresses the current on-hand in the newly chosen unit.
  function changeUnit(id: string) {
    const f = unitList.find((u) => u.uom_id === id)?.factor ?? 1;
    setUnitId(id);
    setQty(tidy(currentQty / f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await adjustStock(productId, newBaseQty, reason || null);
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

  const hasAltUnits = unitList.length > 1;

  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={openDialog}>
        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Adjust
      </Button>
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        title={`Adjust stock — ${name}`}
        description="Enter the actual quantity on hand, in any unit. We'll record the difference as a stock adjustment."
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Current on hand: <span className="font-mono font-medium text-foreground">{tidy(currentQty)} {baseCode}</span>
          </div>
          <div className="space-y-1.5">
            <Label>New quantity on hand</Label>
            <div className="flex gap-2">
              <Input type="number" step="0.0001" min="0" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus className="flex-1" />
              {hasAltUnits ? (
                <div className="w-32 shrink-0">
                  <SearchableSelect
                    value={unitId}
                    onChange={changeUnit}
                    options={unitList.map((u) => ({ value: u.uom_id, label: u.label }))}
                    placeholder="unit"
                  />
                </div>
              ) : (
                <div className="grid place-items-center px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground shrink-0">{baseCode}</div>
              )}
            </div>
            {hasAltUnits && factor !== 1 && (
              <p className="text-xs text-muted-foreground">Sets on hand to <span className="font-medium">{tidy(newBaseQty)} {baseCode}</span> ({qty || 0} {code} × {tidy(factor)}).</p>
            )}
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
