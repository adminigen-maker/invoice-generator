import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateFromSOButtons } from "./actions-client";

export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const perms = await getPermissions();

  const { data: so } = await supabase
    .from("sales_order")
    .select(`
      *,
      customer:customer(name, code),
      quotation:quotation(number),
      lines:sales_order_line(sequence, description, product:product(sku,name), uom:unit_of_measure(code),
        quantity_ordered, quantity_delivered, quantity_invoiced, unit_price, discount_pct, line_total,
        tax:tax_rate(code))
    `)
    .eq("id", id)
    .maybeSingle();
  if (!so) return notFound();

  const canDeliver = perms.has(P.inventory.deliveryCreate);
  const canInvoice = perms.has(P.invoice.create);

  const anyOutstandingDelivery = (so.lines ?? []).some(
    (l: { quantity_ordered: number; quantity_delivered: number }) => Number(l.quantity_ordered) > Number(l.quantity_delivered)
  );
  const anyOutstandingInvoice = (so.lines ?? []).some(
    (l: { quantity_delivered: number; quantity_invoiced: number }) => Number(l.quantity_delivered) > Number(l.quantity_invoiced)
  );

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {so.number}
            <StatusBadge status={so.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {(so.customer as { name?: string } | null)?.name} · {formatDate(so.order_date)}
            {so.quotation && (<> · from <Link className="underline" href={`/quotations?q=${(so.quotation as { number?: string }).number}`}>{(so.quotation as { number?: string }).number}</Link></>)}
          </p>
        </div>
        <CreateFromSOButtons
          salesOrderId={so.id}
          canDeliver={canDeliver && anyOutstandingDelivery}
          canInvoice={canInvoice && anyOutstandingInvoice}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(so.lines ?? []).sort((a: { sequence: number }, b: { sequence: number }) => a.sequence - b.sequence).map((l: {
                sequence: number; description: string;
                product?: { sku?: string; name?: string } | null;
                uom?: { code?: string } | null;
                quantity_ordered: number; quantity_delivered: number; quantity_invoiced: number;
                unit_price: number; line_total: number;
              }, i: number) => (
                <TableRow key={i}>
                  <TableCell>
                    <div>{l.description}</div>
                    {l.product?.sku && <div className="text-xs text-muted-foreground">{l.product.sku}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{Number(l.quantity_ordered).toFixed(2)} {l.uom?.code}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{Number(l.quantity_delivered).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{Number(l.quantity_invoiced).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(l.unit_price, so.currency)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(l.line_total, so.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2" />
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <Row label="Subtotal" value={formatMoney(so.subtotal, so.currency)} />
            <Row label="Discount" value={`− ${formatMoney(so.discount_total, so.currency)}`} />
            <Row label="Tax" value={formatMoney(so.tax_total, so.currency)} />
            <div className="border-t pt-2 flex justify-between font-semibold text-base">
              <span>Total</span><span className="font-mono">{formatMoney(so.total, so.currency)}</span>
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
