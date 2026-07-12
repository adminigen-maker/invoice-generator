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
import { createInvoice } from "./actions";
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

type Props = {
  customers: Opt[];
  products: Opt[];
  uoms: Opt[];
  taxes: Opt[];
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

export function InvoiceForm({ customers: customersInit, products: productsInit, uoms, taxes }: Props) {
  const router = useRouter();
  const [pending, startTx] = useTransition();

  const [customers, setCustomers] = useState(customersInit);
  const [products, setProducts] = useState(productsInit);
  const [customerAddOpen, setCustomerAddOpen] = useState(false);
  const [productAddLine, setProductAddLine] = useState<number | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [currency] = useState("AED");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const prodMap = useMemo(() => productMap(products), [products]);
  const taxMap = useMemo(() => new Map(taxes.map((t) => [t.id, Number(t.extra?.rate ?? 0)])), [taxes]);
  const uomCodeById = useMemo(() => new Map(uoms.map((u) => [u.id, u.label])), [uoms]);

  const productOptions = useMemo(
    () => products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>),
    [products]
  );
  const uomOptions = useMemo(() => uoms.map((u) => <option key={u.id} value={u.id}>{u.label}</option>), [uoms]);
  const taxOptions = useMemo(() => taxes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>), [taxes]);
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

  function onSave() {
    if (!customerId) {
      toast.error("Select a customer");
      return;
    }
    startTx(async () => {
      const res = await createInvoice({
        customer_id: customerId,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
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
      toast.success("Invoice created");
      router.push(`/invoices/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Customer <span className="text-destructive">*</span></Label>
          <div className="flex gap-2">
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">— select customer —</option>
              {customerOptions}
            </select>
            <Button type="button" variant="outline" size="icon" className="shrink-0" title="Add new customer" onClick={() => setCustomerAddOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Invoice date</Label>
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
                      <select
                        value={l.product_id}
                        onChange={(e) => pickProduct(i, e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {productOptions}
                      </select>
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Add new product" onClick={() => setProductAddLine(i)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {lp?.extra?.stock != null && (
                      <div className={`text-[11px] mt-1 ${Number(lp.extra.stock) <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        In stock: {Number(lp.extra.stock).toFixed(2)}{lockedUomCode ? ` ${lockedUomCode}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="p-1.5">
                    <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} className="h-9" />
                  </td>
                  <td className="p-1.5">
                    <Input type="number" step="0.01" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className="h-9 text-right" />
                  </td>
                  <td className="p-1.5">
                    <select value={l.uom_id} onChange={(e) => updateLine(i, { uom_id: e.target.value })}
                      disabled={!!lockedUom}
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
                    <Input type="number" step="0.01" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} className="h-9 text-right" />
                  </td>
                  <td className="p-1.5">
                    <Input type="number" step="0.01" value={l.discount_pct} onChange={(e) => updateLine(i, { discount_pct: e.target.value })} className="h-9 text-right" />
                  </td>
                  <td className="p-1.5">
                    <select value={l.tax_id} onChange={(e) => updateLine(i, { tax_id: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                      <option value="">—</option>
                      {taxOptions}
                    </select>
                  </td>
                  <td className="p-1.5 text-right font-mono">{formatMoney(linetotal.line_total, currency)}</td>
                  <td className="p-1.5">
                    <Button type="button" variant="ghost" size="icon" onClick={() => setLines((p) => p.filter((_, ix) => ix !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-2 border-t bg-muted/30">
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
            <Plus className="h-4 w-4 mr-2" />Add line
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Terms & conditions</Label>
            <Textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
        </div>
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
          <Row label="Discount" value={`− ${formatMoney(totals.discount_total, currency)}`} />
          <Row label="Tax (VAT)" value={formatMoney(totals.tax_total, currency)} />
          <div className="border-t pt-2 flex justify-between font-semibold text-base">
            <span>Total</span><span className="font-mono">{formatMoney(totals.total, currency)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/invoices")} disabled={pending}>Cancel</Button>
        <Button type="button" onClick={onSave} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {pending ? "Creating…" : "Create invoice"}
        </Button>
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
