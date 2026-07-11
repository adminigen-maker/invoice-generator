"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { computeLine, computeTotals } from "@/lib/pricing";
import { formatMoney } from "@/lib/utils";
import { saveQuotation, confirmQuotation } from "./actions";

type Opt = { id: string; label: string; extra?: Record<string, string | number | null> };
type Line = {
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  uom_id: string;
  unit_price: string;
  discount_pct: string;
  tax_id: string;
};

export type QuotationInitial = {
  id: string;
  customer_id: string;
  quote_date: string;
  valid_until: string | null;
  currency: string;
  notes: string | null;
  terms: string | null;
  status: string;
  lines: Array<{
    product_id: string | null;
    description: string;
    quantity: number | string;
    uom_id: string | null;
    unit_price: number | string;
    discount_pct: number | string;
    tax_id: string | null;
  }>;
};

type Props = {
  initial?: QuotationInitial | null;
  customers: Opt[];
  products: Opt[];
  uoms: Opt[];
  taxes: Opt[];
  canConfirm: boolean;
};

const emptyLine = (): Line => ({
  key: crypto.randomUUID(),
  product_id: "",
  description: "",
  quantity: "1",
  uom_id: "",
  unit_price: "0",
  discount_pct: "0",
  tax_id: "",
});

const productMap = (products: Opt[]) => new Map(products.map((p) => [p.id, p]));

export function QuotationForm({ initial, customers, products, uoms, taxes, canConfirm }: Props) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [confirming, startConfirm] = useTransition();

  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [quoteDate, setQuoteDate] = useState(initial?.quote_date ?? new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "AED");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");

  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          key: crypto.randomUUID(),
          product_id: l.product_id ?? "",
          description: l.description ?? "",
          quantity: String(l.quantity ?? "1"),
          uom_id: l.uom_id ?? "",
          unit_price: String(l.unit_price ?? "0"),
          discount_pct: String(l.discount_pct ?? "0"),
          tax_id: l.tax_id ?? "",
        }))
      : [emptyLine()]
  );

  const prodMap = useMemo(() => productMap(products), [products]);
  const taxMap = useMemo(() => new Map(taxes.map((t) => [t.id, Number(t.extra?.rate ?? 0)])), [taxes]);

  // Build the dropdown <option> lists ONCE. Without this, every keystroke in any
  // field re-created N products × rows option elements, the main typing lag.
  // React lets the same element array be reused across all the row selects.
  const productOptions = useMemo(
    () => products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>),
    [products]
  );
  const uomOptions = useMemo(
    () => uoms.map((u) => <option key={u.id} value={u.id}>{u.label}</option>),
    [uoms]
  );
  const taxOptions = useMemo(
    () => taxes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>),
    [taxes]
  );
  const customerOptions = useMemo(
    () => customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>),
    [customers]
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function pickProduct(i: number, productId: string) {
    const p = prodMap.get(productId);
    updateLine(i, {
      product_id: productId,
      description: p?.label.split(" — ").slice(1).join(" — ") || p?.label || "",
      unit_price: String(p?.extra?.sale_price ?? "0"),
      uom_id: (p?.extra?.uom_id as string) ?? "",
      tax_id: (p?.extra?.tax_id as string) ?? "",
    });
  }

  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          tax_rate: l.tax_id ? taxMap.get(l.tax_id) ?? 0 : 0,
        }))
      ),
    [lines, taxMap]
  );

  async function onSave() {
    startTx(async () => {
      const res = await saveQuotation(initial?.id ?? null, {
        customer_id: customerId,
        quote_date: quoteDate,
        valid_until: validUntil || null,
        currency,
        notes: notes || null,
        terms: terms || null,
        lines: lines.map((l) => ({
          product_id: l.product_id || null,
          description: l.description,
          quantity: Number(l.quantity),
          uom_id: l.uom_id || null,
          unit_price: Number(l.unit_price),
          discount_pct: Number(l.discount_pct),
          tax_id: l.tax_id || null,
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Quotation saved");
      router.push(`/quotations/${res.id}`);
      router.refresh();
    });
  }

  async function onConfirm() {
    if (!initial?.id) {
      toast.error("Save the quotation first");
      return;
    }
    startConfirm(async () => {
      const res = await confirmQuotation(initial.id);
      if (res && !res.ok) toast.error(res.error);
    });
  }

  const isReadOnly = !!(initial?.status && initial.status !== "draft" && initial.status !== "sent");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Customer <span className="text-destructive">*</span></Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={isReadOnly}
          >
            <option value="">— select customer —</option>
            {customerOptions}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Quote date</Label>
          <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} disabled={isReadOnly} />
        </div>
        <div className="space-y-1.5">
          <Label>Valid until</Label>
          <Input type="date" value={validUntil ?? ""} onChange={(e) => setValidUntil(e.target.value)} disabled={isReadOnly} />
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2 w-[26%]">Product</th>
              <th className="p-2">Description</th>
              <th className="p-2 w-20 text-right">Qty</th>
              <th className="p-2 w-24">UoM</th>
              <th className="p-2 w-28 text-right">Unit price</th>
              <th className="p-2 w-20 text-right">Disc %</th>
              <th className="p-2 w-24">Tax</th>
              <th className="p-2 w-28 text-right">Line total</th>
              <th className="p-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const linetotal = computeLine({
                quantity: l.quantity,
                unit_price: l.unit_price,
                discount_pct: l.discount_pct,
                tax_rate: l.tax_id ? taxMap.get(l.tax_id) ?? 0 : 0,
              });
              return (
                <tr key={l.key} className="border-t">
                  <td className="p-1.5">
                    <select
                      value={l.product_id}
                      onChange={(e) => pickProduct(i, e.target.value)}
                      disabled={isReadOnly}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">—</option>
                      {productOptions}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} disabled={isReadOnly} className="h-9" />
                  </td>
                  <td className="p-1.5">
                    <Input type="number" step="0.01" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} disabled={isReadOnly} className="h-9 text-right" />
                  </td>
                  <td className="p-1.5">
                    <select value={l.uom_id} onChange={(e) => updateLine(i, { uom_id: e.target.value })} disabled={isReadOnly}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                      <option value="">—</option>
                      {uomOptions}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <Input type="number" step="0.01" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} disabled={isReadOnly} className="h-9 text-right" />
                  </td>
                  <td className="p-1.5">
                    <Input type="number" step="0.01" value={l.discount_pct} onChange={(e) => updateLine(i, { discount_pct: e.target.value })} disabled={isReadOnly} className="h-9 text-right" />
                  </td>
                  <td className="p-1.5">
                    <select value={l.tax_id} onChange={(e) => updateLine(i, { tax_id: e.target.value })} disabled={isReadOnly}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                      <option value="">—</option>
                      {taxOptions}
                    </select>
                  </td>
                  <td className="p-1.5 text-right font-mono">{formatMoney(linetotal.line_total, currency)}</td>
                  <td className="p-1.5">
                    {!isReadOnly && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setLines((p) => p.filter((_, ix) => ix !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isReadOnly && (
          <div className="p-2 border-t bg-muted/30">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
              <Plus className="h-4 w-4 mr-2" />Add line
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={4} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} disabled={isReadOnly} />
          </div>
          <div className="space-y-1.5">
            <Label>Terms & conditions</Label>
            <Textarea rows={4} value={terms ?? ""} onChange={(e) => setTerms(e.target.value)} disabled={isReadOnly} />
          </div>
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

      <div className="flex justify-end gap-2">
        {initial?.id && canConfirm && !isReadOnly && (
          <Button variant="outline" type="button" onClick={onConfirm} disabled={confirming}>
            {confirming ? "Confirming…" : "Confirm → Sales Order"}
          </Button>
        )}
        {!isReadOnly && (
          <Button type="button" onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : initial?.id ? "Save changes" : "Create quotation"}
          </Button>
        )}
      </div>
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
