import { notFound } from "next/navigation";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PostInvoiceButton, RecordPaymentForm } from "./client-actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: inv }, canPost, canPay] = await Promise.all([
    supabase.from("invoice").select(`
      *,
      customer:customer(name, code, tax_registration_number),
      lines:invoice_line(sequence, description, product:product(sku), uom:unit_of_measure(code),
        quantity, unit_price, discount_pct, line_total, tax:tax_rate(code, rate)),
      allocations:payment_allocation(amount_allocated, payment:payment(number, payment_date, method))
    `).eq("id", id).maybeSingle(),
    can(P.invoice.post),
    can(P.invoice.paymentCreate),
  ]);
  if (!inv) return notFound();

  const posted = !!inv.posted_at;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {inv.number}
            <StatusBadge status={inv.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {(inv.customer as { name?: string } | null)?.name} · Issued {formatDate(inv.invoice_date)}
            {inv.due_date && <> · Due {formatDate(inv.due_date)}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/invoices/${id}/pdf`} target="_blank">
              <FileDown className="h-4 w-4 mr-2" />PDF
            </Link>
          </Button>
          {!posted && canPost && <PostInvoiceButton id={inv.id} />}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Disc %</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(inv.lines ?? []).sort((a: { sequence: number }, b: { sequence: number }) => a.sequence - b.sequence).map((l: {
                sequence: number; description: string;
                product?: { sku?: string } | null;
                uom?: { code?: string } | null;
                tax?: { code?: string; rate?: number } | null;
                quantity: number; unit_price: number; discount_pct: number; line_total: number;
              }, i: number) => (
                <TableRow key={i}>
                  <TableCell>
                    {l.description}
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
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
          <CardContent>
            {((inv.allocations ?? []) as Array<{ amount_allocated: number; payment?: { number?: string; payment_date?: string; method?: string } | null }>).length === 0 && (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            )}
            <ul className="space-y-2">
              {((inv.allocations ?? []) as Array<{ amount_allocated: number; payment?: { number?: string; payment_date?: string; method?: string } | null }>).map((a, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>
                    <span className="font-mono text-xs">{a.payment?.number}</span>
                    {" · "}
                    <span>{formatDate(a.payment?.payment_date)}</span>
                    {" · "}
                    <span className="capitalize">{a.payment?.method?.replace("_", " ")}</span>
                  </span>
                  <span className="font-mono">{formatMoney(a.amount_allocated, inv.currency)}</span>
                </li>
              ))}
            </ul>
            {posted && canPay && Number(inv.balance) > 0 && (
              <div className="mt-4 border-t pt-4">
                <RecordPaymentForm invoiceId={inv.id} balance={Number(inv.balance)} currency={inv.currency} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <Row label="Subtotal" value={formatMoney(inv.subtotal, inv.currency)} />
            <Row label="Discount" value={`− ${formatMoney(inv.discount_total, inv.currency)}`} />
            <Row label="Tax" value={formatMoney(inv.tax_total, inv.currency)} />
            <div className="border-t pt-2 flex justify-between font-semibold text-base">
              <span>Total</span><span className="font-mono">{formatMoney(inv.total, inv.currency)}</span>
            </div>
            <Row label="Paid" value={formatMoney(inv.amount_paid, inv.currency)} />
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Balance</span><span className="font-mono">{formatMoney(inv.balance, inv.currency)}</span>
            </div>
          </CardContent>
        </Card>
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
