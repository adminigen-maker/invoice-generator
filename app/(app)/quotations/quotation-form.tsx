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
import { formatMoney, formatDate } from "@/lib/utils";
import { getCustomerLastPrice } from "@/lib/customer-price";
import { saveQuotation, confirmQuotation } from "./actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuickAddCustomer } from "@/components/quick-add/quick-add-customer";
import { QuickAddProduct } from "@/components/quick-add/quick-add-product";

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

export function QuotationForm({
  initial,
  customers: customersInit,
  products: productsInit,
  uoms,
  taxes,
  canConfirm,
}: Props) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [confirming, startConfirm] = useTransition();

  // Options are local state so the "+ New …" quick-add can append to them.
  const [customers, setCustomers] = useState(customersInit);
  const [products, setProducts] = useState(productsInit);
  const [customerAddOpen, setCustomerAddOpen] = useState(false);
  const [productAddLine, setProductAddLine] = useState<number | null>(null);

  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [quoteDate, setQuoteDate] = useState(initial?.quote_date ?? new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState<string>(() => {
    if (initial?.valid_until) return initial.valid_until;
    const d = new Date();
    d.setDate(d.getDate() + 30); // default: valid for 30 days
    return d.toISOString().slice(0, 10);
  });
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
  const uomCodeById = useMemo(() => new Map(uoms.map((u) => [u.id, u.label])), [uoms]);

  // Build the dropdown <option> lists ONCE. Without this, every keystroke in any
  // field re-created N products × rows option elements, the main typing lag.
  // React lets the same element array be reused across all the row selects.
  const productComboOptions = useMemo(() => products.map((p) => ({ value: p.id, label: p.label })), [products]);
  const uomOptions = useMemo(
    () => uoms.map((u) => <option key={u.id} value={u.id}>{u.label}</option>),
    [uoms]
  );
  const taxOptions = useMemo(
    () => taxes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>),
    [taxes]
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // The customer's last price per product (null = never bought). Used to warn
  // when the price being quoted is higher than what they paid before.
  const [priceHist, setPriceHist] = useState<Record<string, { price: number; date: string } | null>>({});
  function loadHist(cust: string, productId: string) {
    if (!cust || !productId || priceHist[productId] !== undefined) return;
    getCustomerLastPrice(cust, productId).then((r) => setPriceHist((prev) => ({ ...prev, [productId]: r })));
  }
  function onCustomerChange(id: string) {
    setCustomerId(id);
    setPriceHist({});
    if (!id) return;
    const seen = new Set<string>();
    for (const l of lines) {
      if (l.product_id && !seen.has(l.product_id)) {
        seen.add(l.product_id);
        getCustomerLastPrice(id, l.product_id).then((r) => setPriceHist((prev) => ({ ...prev, [l.product_id]: r })));
      }
    }
  }

  function pickProduct(i: number, productId: string) {
    const p = prodMap.get(productId);
    loadHist(customerId, productId);
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

  /** Lines asking for more than we hold (stockable products only). */
  function overStockLines() {
    return lines.filter((l) => {
      const p = l.product_id ? prodMap.get(l.product_id) : undefined;
      const stock = p?.extra?.stock;
      return stock != null && Number(l.quantity) > Number(stock);
    });
  }

  async function onSave() {
    if (!validUntil) {
      toast.error("Please set a “Valid until” date");
      return;
    }
    const over = overStockLines();
    if (over.length) {
      toast.error(`Not enough stock on ${over.length} line${over.length > 1 ? "s" : ""} — reduce the quantity or restock first.`);
      return;
    }
    startTx(async () => {
      const res = await saveQuotation(initial?.id ?? null, {
        customer_id: customerId,
        quote_date: quoteDate,
        valid_until: validUntil,
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
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Sales order created");
      router.push(`/sales-orders/${res.id}`);
      router.refresh();
    });
  }

  const isReadOnly = !!(initial?.status && initial.status !== "draft" && initial.status !== "sent");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Customer <span className="text-destructive">*</span></Label>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <SearchableSelect
                value={customerId}
                onChange={onCustomerChange}
                options={customers.map((c) => ({ value: c.id, label: c.label }))}
                placeholder="— select customer —"
                disabled={isReadOnly}
              />
            </div>
            {!isReadOnly && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title="Add new customer"
                onClick={() => setCustomerAddOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Quote date</Label>
          <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} disabled={isReadOnly} />
        </div>
        <div className="space-y-1.5">
          <Label>Valid until <span className="text-destructive">*</span></Label>
          <Input type="date" value={validUntil ?? ""} onChange={(e) => setValidUntil(e.target.value)} disabled={isReadOnly} required />
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
              const lp = l.product_id ? prodMap.get(l.product_id) : undefined;
              const lockedUom = (lp?.extra?.uom_id as string) || "";
              const lockedUomCode = lockedUom ? uomCodeById.get(lockedUom) ?? "" : "";
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
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          title="Add new product"
                          onClick={() => setProductAddLine(i)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {lp?.extra?.stock != null && (() => {
                      const stock = Number(lp.extra!.stock);
                      const over = Number(l.quantity) > stock;
                      return (
                        <div className={`text-[11px] mt-1 ${over || stock <= 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          In stock: {stock.toFixed(0)}{lockedUomCode ? ` ${lockedUomCode}` : ""}
                          {over && ` — only ${stock.toFixed(0)} available`}
                        </div>
                      );
                    })()}
                    {l.product_id && priceHist[l.product_id] && (
                      <div className={`text-[11px] mt-1 ${Number(l.unit_price) > priceHist[l.product_id]!.price ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                        Last to customer: {formatMoney(priceHist[l.product_id]!.price, currency)} · {formatDate(priceHist[l.product_id]!.date)}
                        {Number(l.unit_price) > priceHist[l.product_id]!.price ? " ↑ higher" : ""}
                      </div>
                    )}
                  </td>
                  <td className="p-1.5">
                    <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} disabled={isReadOnly || !!l.product_id} className="h-9 disabled:opacity-70" />
                  </td>
                  <td className="p-1.5">
                    <Input type="number" step="1" min="0" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} disabled={isReadOnly} className="h-9 text-right" />
                  </td>
                  <td className="p-1.5">
                    <select value={l.uom_id} onChange={(e) => updateLine(i, { uom_id: e.target.value })}
                      disabled={isReadOnly || !!lockedUom}
                      title={lockedUom ? "Unit is fixed by the selected product" : undefined}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70">
                      {lockedUom ? (
                        <option value={lockedUom}>{lockedUomCode || "—"}</option>
                      ) : (
                        <>
                          <option value="">—</option>
                          {uomOptions}
                        </>
                      )}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <Input type="number" step="0.01" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} disabled={isReadOnly || !!l.product_id} title={l.product_id ? "Price comes from the product" : undefined} className="h-9 text-right disabled:opacity-70" />
                  </td>
                  <td className="p-1.5">
                    <Input type="number" step="0.01" value={l.discount_pct} onChange={(e) => updateLine(i, { discount_pct: e.target.value })} disabled={isReadOnly} className="h-9 text-right" />
                  </td>
                  <td className="p-1.5">
                    <select value={l.tax_id} onChange={(e) => updateLine(i, { tax_id: e.target.value })} disabled={isReadOnly || !!l.product_id}
                      title={l.product_id ? "Tax comes from the product" : undefined}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70">
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
          <Button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {confirming ? "Confirming…" : "Confirm → Sales Order"}
          </Button>
        )}
        {!isReadOnly && (
          <Button type="button" onClick={onSave} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pending ? "Saving…" : initial?.id ? "Save changes" : "Create quotation"}
          </Button>
        )}
      </div>

      <QuickAddCustomer
        open={customerAddOpen}
        onClose={() => setCustomerAddOpen(false)}
        taxes={taxes}
        onCreated={(item) => {
          setCustomers((prev) => [...prev, { id: item.id, label: item.label, extra: item.extra }]);
          setCustomerId(item.id);
        }}
      />
      <QuickAddProduct
        open={productAddLine !== null}
        onClose={() => setProductAddLine(null)}
        uoms={uoms}
        taxes={taxes}
        onCreated={(item) => {
          setProducts((prev) => [...prev, { id: item.id, label: item.label, extra: item.extra }]);
          if (productAddLine !== null) {
            const desc = item.label.split(" — ").slice(1).join(" — ") || item.label;
            updateLine(productAddLine, {
              product_id: item.id,
              description: desc,
              unit_price: String(item.extra.sale_price ?? "0"),
              uom_id: (item.extra.uom_id as string) ?? "",
              tax_id: (item.extra.tax_id as string) ?? "",
            });
          }
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
