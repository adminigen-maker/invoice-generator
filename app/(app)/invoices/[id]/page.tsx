import { notFound } from "next/navigation";
import { PdfButton } from "@/components/pdf-button";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PostInvoiceButton, RecordPaymentForm, CancelInvoiceButton } from "./client-actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: inv }, canPost, canPay, canCancel] = await Promise.all([
    supabase.from("invoice").select(`
      *,
      customer:customer(name, code, tax_registration_number),
      lines:invoice_line(sequence, description, product:product(sku, name), uom:unit_of_measure(code),
        quantity, unit_price, discount_pct, line_total, tax:tax_rate(code, rate)),
      allocations:payment_allocation(amount_allocated, payment:payment(number, payment_date, method, reference))
    `).eq("id", id).maybeSingle(),
    can(P.invoice.post),
    can(P.invoice.paymentCreate),
    can(P.invoice.edit),
  ]);
  if (!inv) return notFound();

  const posted = !!inv.posted_at;
  const total = Number(inv.total ?? 0);
  const paid = Number(inv.amount_paid ?? 0);
  const balance = Number(inv.balance ?? 0);
  const paidPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const overdue = posted && balance > 0.001 && !!inv.due_date && new Date(inv.due_date) < new Date();
  const isDraft = inv.status === "draft";

  const lines = ((inv.lines ?? []) as LineRow[]).slice().sort((a, b) => a.sequence - b.sequence);
  const allocations = (inv.allocations ?? []) as AllocRow[];

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {inv.number}
            <StatusBadge status={overdue ? "overdue" : inv.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {inv.sales_order_id ? "From a sales order" : "Standalone invoice"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PdfButton url={`/invoices/${id}/pdf`} filename={`${inv.number}.pdf`} />
          {!posted && canPost && <PostInvoiceButton id={inv.id} />}
          {isDraft && canCancel && <CancelInvoiceButton id={inv.id} />}
        </div>
      </div>

      {/* Meta row */}
      <Card>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
          <Meta label="Customer" value={(inv.customer as { name?: string } | null)?.name ?? "—"} />
          <Meta label="Invoice date" value={formatDate(inv.invoice_date)} />
          <Meta
            label="Due date"
            value={inv.due_date ? formatDate(inv.due_date) : "—"}
            danger={overdue}
            suffix={overdue ? "Overdue" : undefined}
          />
          <div className="space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Payment progress</div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${paidPct >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${Math.max(paidPct, paidPct > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums">{paidPct}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Invoice total" value={formatMoney(total, inv.currency)} />
        <StatCard label="Amount paid" value={formatMoney(paid, inv.currency)} tone="success" />
        <StatCard
          label="Amount due"
          value={formatMoney(balance, inv.currency)}
          tone={balance > 0.001 ? "danger" : "success"}
        />
      </div>

      {/* Lines */}
      <Card>
        <CardHeader><CardTitle className="text-base">Invoice lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Disc %</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{l.product?.name ?? l.description}</div>
                    {l.product?.name && l.description && l.description !== l.product.name && (
                      <div className="text-xs text-muted-foreground">{l.description}</div>
                    )}
                    {l.product?.sku && <div className="text-xs text-muted-foreground font-mono">{l.product.sku}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{Number(l.quantity).toFixed(2)} {l.uom?.code}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(l.unit_price, inv.currency)}</TableCell>
                  <TableCell className="text-right font-mono">{Number(l.discount_pct).toFixed(2)}%</TableCell>
                  <TableCell>{l.tax?.code ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(l.line_total, inv.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-end pt-4">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(inv.subtotal, inv.currency)} />
              {Number(inv.discount_total) > 0 && (
                <Row label="Discount" value={`− ${formatMoney(inv.discount_total, inv.currency)}`} />
              )}
              <Row label="Tax (VAT)" value={formatMoney(inv.tax_total, inv.currency)} />
              <div className="border-t pt-2 flex justify-between font-semibold text-base">
                <span>Grand total</span>
                <span className="font-mono">{formatMoney(total, inv.currency)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment history + record payment */}
      <Card>
        <CardHeader><CardTitle className="text-base">Payment history</CardTitle></CardHeader>
        <CardContent>
          {allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{a.payment?.number ?? "—"}</TableCell>
                    <TableCell>{formatDate(a.payment?.payment_date)}</TableCell>
                    <TableCell className="capitalize">{a.payment?.method?.replace("_", " ") ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.payment?.reference ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">
                      {formatMoney(a.amount_allocated, inv.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {posted && canPay && balance > 0.001 && (
            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-medium mb-3">Record a payment</div>
              <RecordPaymentForm invoiceId={inv.id} balance={balance} currency={inv.currency} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type LineRow = {
  sequence: number;
  description: string;
  product?: { sku?: string; name?: string } | null;
  uom?: { code?: string } | null;
  tax?: { code?: string; rate?: number } | null;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
};

type AllocRow = {
  amount_allocated: number;
  payment?: { number?: string; payment_date?: string; method?: string; reference?: string } | null;
};

function Meta({ label, value, danger, suffix }: { label: string; value: string; danger?: boolean; suffix?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${danger ? "text-destructive" : ""}`}>
        {value}
        {suffix && <span className="ml-1 text-xs">({suffix})</span>}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="pt-6 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tracking-tight font-mono ${color}`}>{value}</div>
      </CardContent>
    </Card>
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
