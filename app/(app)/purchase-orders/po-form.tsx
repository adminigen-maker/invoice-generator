"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { computeLine, computeTotals } from "@/lib/pricing";
import { formatMoney } from "@/lib/utils";
import { savePurchaseOrder } from "./actions";

type Line = { key: string; description: string; quantity: string; uom_text: string; unit_price: string; discount_pct: string; tax_pct: string };

export type POInitial = {
  id: string;
  vendor_name: string;
  order_date: string;
  expected_date: string | null;
  currency: string;
  notes: string | null;
  status: string;
  lines: Array<{ description: string; quantity: number | string; uom_text: string | null; unit_price: number | string; discount_pct: number | string; tax_pct: number | string }>;
};

const emptyLine = (): Line => ({ key: crypto.randomUUID(), description: "", quantity: "1", uom_text: "", unit_price: "0", discount_pct: "0", tax_pct: "0" });

/**
 * Standalone purchase order — a plain document. Vendor is free text, and each
 * line is free text too (description / qty / unit / cost / tax %). Nothing links
 * to the product, vendor, unit or tax tables, and it does not affect stock.
 */
export function PurchaseOrderForm({ initial }: { initial?: POInitial | null }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();

  const [vendorName, setVendorName] = useState(initial?.vendor_name ?? "");
  const [orderDate, setOrderDate] = useState(initial?.order_date ?? new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState(initial?.expected_date ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "AED");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          key: crypto.randomUUID(),
          description: l.description ?? "",
          quantity: String(l.quantity ?? "1"),
          uom_text: l.uom_text ?? "",
          unit_price: String(l.unit_price ?? "0"),
          discount_pct: String(l.discount_pct ?? "0"),
          tax_pct: String(l.tax_pct ?? "0"),
        }))
      : [emptyLine()]
  );

  const isReadOnly = !!(initial?.status && initial.status !== "draft");

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const totals = useMemo(
    () => computeTotals(lines.map((l) => ({ quantity: l.quantity, unit_price: l.unit_price, discount_pct: l.discount_pct, tax_rate: Number(l.tax_pct) || 0 }))),
    [lines]
  );

  function onSave() {
    if (!vendorName.trim()) {
      toast.error("Enter a vendor name");
      return;
    }
    startTx(async () => {
      const res = await savePurchaseOrder(initial?.id ?? null, {
        vendor_name: vendorName.trim(),
        order_date: orderDate,
        expected_date: expectedDate || null,
        currency,
        notes: notes || null,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          uom_text: l.uom_text || null,
          unit_price: Number(l.unit_price),
          discount_pct: Number(l.discount_pct),
          tax_pct: Number(l.tax_pct) || 0,
        })),
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Purchase order saved");
      router.push(`/purchase-orders/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Vendor <span className="text-destructive">*</span></Label>
          <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} disabled={isReadOnly} placeholder="Vendor / supplier name" />
        </div>
        <div className="space-y-1.5">
          <Label>Order date</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} disabled={isReadOnly} />
        </div>
        <div className="space-y-1.5">
          <Label>Expected date</Label>
          <Input type="date" value={expectedDate ?? ""} onChange={(e) => setExpectedDate(e.target.value)} disabled={isReadOnly} />
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">Description</th>
              <th className="p-2 w-20 text-right">Qty</th>
              <th className="p-2 w-24">Unit</th>
              <th className="p-2 w-28 text-right">Unit cost</th>
              <th className="p-2 w-20 text-right">Disc %</th>
              <th className="p-2 w-20 text-right">Tax %</th>
              <th className="p-2 w-28 text-right">Line total</th>
              <th className="p-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const lt = computeLine({ quantity: l.quantity, unit_price: l.unit_price, discount_pct: l.discount_pct, tax_rate: Number(l.tax_pct) || 0 });
              return (
                <tr key={l.key} className="border-t align-top">
                  <td className="p-1.5"><Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} disabled={isReadOnly} className="h-9" placeholder="What you're ordering" /></td>
                  <td className="p-1.5"><Input type="number" step="0.01" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} disabled={isReadOnly} className="h-9 text-right" /></td>
                  <td className="p-1.5"><Input value={l.uom_text} onChange={(e) => updateLine(i, { uom_text: e.target.value })} disabled={isReadOnly} className="h-9" placeholder="pcs" /></td>
                  <td className="p-1.5"><Input type="number" step="0.01" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} disabled={isReadOnly} className="h-9 text-right" /></td>
                  <td className="p-1.5"><Input type="number" step="0.01" value={l.discount_pct} onChange={(e) => updateLine(i, { discount_pct: e.target.value })} disabled={isReadOnly} className="h-9 text-right" /></td>
                  <td className="p-1.5"><Input type="number" step="0.01" value={l.tax_pct} onChange={(e) => updateLine(i, { tax_pct: e.target.value })} disabled={isReadOnly} className="h-9 text-right" /></td>
                  <td className="p-1.5 text-right font-mono">{formatMoney(lt.line_total, currency)}</td>
                  <td className="p-1.5">
                    {!isReadOnly && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setLines((p) => p.filter((_, ix) => ix !== i))}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isReadOnly && (
          <div className="p-2 border-t bg-muted/30">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}><Plus className="h-4 w-4 mr-2" />Add line</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={4} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} disabled={isReadOnly} />
        </div>
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
          <Row label="Discount" value={`− ${formatMoney(totals.discount_total, currency)}`} />
          <Row label="Tax" value={formatMoney(totals.tax_total, currency)} />
          <div className="border-t pt-2 flex justify-between font-semibold text-base">
            <span>Total</span><span className="font-mono">{formatMoney(totals.total, currency)}</span>
          </div>
        </div>
      </div>

      {!isReadOnly && (
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onSave} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pending ? "Saving…" : initial?.id ? "Save changes" : "Create purchase order"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
