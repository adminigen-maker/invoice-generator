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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuickAddVendor } from "@/components/quick-add/quick-add-vendor";
import { QuickAddProduct } from "@/components/quick-add/quick-add-product";
import { QuickAddUom } from "@/components/quick-add/quick-add-uom";

type Opt = { id: string; label: string; extra?: Record<string, string | number | null> };
type Line = { key: string; product_id: string; description: string; quantity: string; uom_id: string; unit_price: string; discount_pct: string; tax_pct: string };

export type POInitial = {
  id: string;
  number: string;
  vendor_id: string;
  order_date: string;
  expected_date: string | null;
  warehouse_id: string | null;
  currency: string;
  notes: string | null;
  status: string;
  lines: Array<{ product_id: string | null; description: string; quantity: number | string; uom_id: string | null; unit_price: number | string; discount_pct: number | string; tax_pct: number | string }>;
};

const emptyLine = (): Line => ({ key: crypto.randomUUID(), product_id: "", description: "", quantity: "1", uom_id: "", unit_price: "0", discount_pct: "0", tax_pct: "0" });

/**
 * Purchase order. Product / Unit / Vendor are picked from master data (with
 * inline "add new"). Qty / Unit cost / Disc % / Tax % are free per-PO values —
 * they are NOT written back onto the product master. Receiving posts stock.
 */
export function PurchaseOrderForm({
  initial, vendors: vendorsInit, products: productsInit, uoms: uomsInit, warehouses, taxes = [],
}: { initial?: POInitial | null; vendors: Opt[]; products: Opt[]; uoms: Opt[]; warehouses: Opt[]; taxes?: Opt[] }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();

  const [vendors, setVendors] = useState(vendorsInit);
  const [products, setProducts] = useState(productsInit);
  const [uoms, setUoms] = useState(uomsInit);
  const [vendorAddOpen, setVendorAddOpen] = useState(false);
  const [productAddLine, setProductAddLine] = useState<number | null>(null);
  const [uomAddLine, setUomAddLine] = useState<number | null>(null);

  const [number, setNumber] = useState(initial?.number ?? "");
  const [vendorId, setVendorId] = useState(initial?.vendor_id ?? "");
  const [orderDate, setOrderDate] = useState(initial?.order_date ?? new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState(initial?.expected_date ?? "");
  const [warehouseId, setWarehouseId] = useState(initial?.warehouse_id ?? "");
  const [currency] = useState(initial?.currency ?? "AED");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          key: crypto.randomUUID(), product_id: l.product_id ?? "", description: l.description ?? "",
          quantity: String(l.quantity ?? "1"), uom_id: l.uom_id ?? "", unit_price: String(l.unit_price ?? "0"),
          discount_pct: String(l.discount_pct ?? "0"), tax_pct: String(l.tax_pct ?? "0"),
        }))
      : [emptyLine()]
  );

  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productComboOptions = useMemo(() => products.map((p) => ({ value: p.id, label: p.label })), [products]);
  const uomComboOptions = useMemo(() => uoms.map((u) => ({ value: u.id, label: u.label })), [uoms]);

  // Editable until the goods are actually received (or it's cancelled/closed) —
  // a confirmed-but-not-yet-received PO can still be corrected.
  const isReadOnly = !!(initial?.status && ["received", "cancelled", "closed"].includes(initial.status));

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function pickProduct(i: number, productId: string) {
    const p = prodMap.get(productId);
    updateLine(i, {
      product_id: productId,
      description: p?.label.split(" — ").slice(1).join(" — ") || p?.label || "",
      unit_price: String(p?.extra?.cost_price ?? "0"),
      uom_id: (p?.extra?.uom_id as string) ?? "",
      tax_pct: String(p?.extra?.tax_rate ?? "0"),
    });
  }

  const totals = useMemo(
    () => computeTotals(lines.map((l) => ({ quantity: l.quantity, unit_price: l.unit_price, discount_pct: l.discount_pct, tax_rate: Number(l.tax_pct) || 0 }))),
    [lines]
  );

  function onSave() {
    if (!number.trim()) {
      toast.error("Enter a purchase order number");
      return;
    }
    if (!vendorId) {
      toast.error("Select a vendor");
      return;
    }
    startTx(async () => {
      const res = await savePurchaseOrder(initial?.id ?? null, {
        number: number.trim(),
        vendor_id: vendorId,
        order_date: orderDate,
        expected_date: expectedDate || null,
        warehouse_id: warehouseId || null,
        currency,
        notes: notes || null,
        lines: lines.map((l) => ({
          product_id: l.product_id || null, description: l.description, quantity: Number(l.quantity),
          uom_id: l.uom_id || null, unit_price: Number(l.unit_price), discount_pct: Number(l.discount_pct), tax_pct: Number(l.tax_pct) || 0,
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
        <div className="space-y-1.5">
          <Label>PO number <span className="text-destructive">*</span></Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. PO-2026-001" disabled={isReadOnly} required />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Vendor <span className="text-destructive">*</span></Label>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <SearchableSelect
                value={vendorId}
                onChange={setVendorId}
                options={vendors.map((v) => ({ value: v.id, label: v.label }))}
                placeholder="— select vendor —"
                disabled={isReadOnly}
              />
            </div>
            {!isReadOnly && (
              <Button type="button" variant="outline" size="icon" className="shrink-0" title="Add new vendor" onClick={() => setVendorAddOpen(true)}><Plus className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Order date</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} disabled={isReadOnly} />
        </div>
        <div className="space-y-1.5">
          <Label>Expected date</Label>
          <Input type="date" value={expectedDate ?? ""} onChange={(e) => setExpectedDate(e.target.value)} disabled={isReadOnly} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Receive into warehouse</Label>
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={isReadOnly}>
            <option value="">— default —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2 w-[24%]">Product</th>
              <th className="p-2">Description</th>
              <th className="p-2 w-20 text-right">Qty</th>
              <th className="p-2 w-28">Unit</th>
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
                  <td className="p-1.5">
                    <div className="flex gap-1">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          value={l.product_id}
                          onChange={(v) => pickProduct(i, v)}
                          options={productComboOptions}
                          placeholder="—"
                          disabled={isReadOnly}
                          triggerClassName="h-9 px-2"
                        />
                      </div>
                      {!isReadOnly && (
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Add new product" onClick={() => setProductAddLine(i)}><Plus className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                  <td className="p-1.5"><Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} disabled={isReadOnly} className="h-9" /></td>
                  <td className="p-1.5"><Input type="number" step="1" min="0" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} disabled={isReadOnly} className="h-9 text-right" /></td>
                  <td className="p-1.5">
                    <div className="flex gap-1">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          value={l.uom_id}
                          onChange={(v) => updateLine(i, { uom_id: v })}
                          options={uomComboOptions}
                          placeholder="—"
                          disabled={isReadOnly}
                          triggerClassName="h-9 px-2"
                        />
                      </div>
                      {!isReadOnly && (
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Add new unit" onClick={() => setUomAddLine(i)}><Plus className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
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

      <QuickAddVendor
        open={vendorAddOpen}
        onClose={() => setVendorAddOpen(false)}
        taxes={taxes}
        onCreated={(item) => { setVendors((prev) => [...prev, item]); setVendorId(item.id); }}
      />
      <QuickAddProduct
        open={productAddLine !== null}
        onClose={() => setProductAddLine(null)}
        uoms={uoms}
        taxes={[]}
        onCreated={(item) => {
          setProducts((prev) => [...prev, { id: item.id, label: item.label, extra: item.extra }]);
          if (productAddLine !== null) {
            const desc = item.label.split(" — ").slice(1).join(" — ") || item.label;
            updateLine(productAddLine, { product_id: item.id, description: desc, uom_id: (item.extra.uom_id as string) ?? "" });
          }
        }}
      />
      <QuickAddUom
        open={uomAddLine !== null}
        onClose={() => setUomAddLine(null)}
        onCreated={(item) => {
          setUoms((prev) => [...prev, item]);
          if (uomAddLine !== null) updateLine(uomAddLine, { uom_id: item.id });
        }}
      />
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
