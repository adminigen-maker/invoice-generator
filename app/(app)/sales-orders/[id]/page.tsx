import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { StatusOverride } from "@/components/status-override";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocMetaGrid, DocStatGrid } from "@/components/doc-detail";
import { CreateFromSOButtons } from "./actions-client";

type Line = {
  sequence: number;
  description: string;
  product?: { sku?: string; name?: string } | null;
  uom?: { code?: string } | null;
  quantity_ordered: number;
  quantity_delivered: number;
  quantity_invoiced: number;
  unit_price: number;
  line_total: number;
};

export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const perms = await getPermissions();

  const [{ data: so }, { data: deliveryNotes }, { data: invoices }] = await Promise.all([
    supabase
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
      .maybeSingle(),
    supabase.from("delivery_note").select("id, number, status, delivery_date").eq("sales_order_id", id).order("delivery_date"),
    supabase.from("invoice").select("id, number, status, total, currency, invoice_date").eq("sales_order_id", id).order("invoice_date"),
  ]);
  if (!so) return notFound();

  const canDeliver = perms.has(P.inventory.deliveryCreate);
  const canInvoice = perms.has(P.invoice.create);
  const lines = ((so.lines ?? []) as Line[]).slice().sort((a, b) => a.sequence - b.sequence);

  const ordered = lines.reduce((s, l) => s + Number(l.quantity_ordered), 0);
  const delivered = lines.reduce((s, l) => s + Number(l.quantity_delivered), 0);
  const invoiced = lines.reduce((s, l) => s + Number(l.quantity_invoiced), 0);
  const deliveredPct = ordered > 0 ? Math.round((delivered / ordered) * 100) : 0;
  const invoicedPct = ordered > 0 ? Math.round((invoiced / ordered) * 100) : 0;

  const anyOutstandingDelivery = lines.some((l) => Number(l.quantity_ordered) > Number(l.quantity_delivered));

  const quote = so.quotation as { number?: string } | null;
  const dnotes = (deliveryNotes ?? []) as { id: string; number: string; status: string; delivery_date: string }[];
  const invs = (invoices ?? []) as { id: string; number: string; status: string; total: number; currency: string }[];

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {so.number}
            <StatusBadge status={so.status} />
          </h1>
          <p className="text-sm text-muted-foreground">Confirmed sales order</p>
        </div>
        <CreateFromSOButtons
          salesOrderId={so.id}
          canCreate={canDeliver && canInvoice && anyOutstandingDelivery && dnotes.length === 0}
        />
      </div>

      {perms.has(P.admin.statusOverride) && <StatusOverride entity="sales_order" id={so.id} current={so.status} />}

      <DocMetaGrid
        items={[
          { label: "Customer", value: (so.customer as { name?: string } | null)?.name ?? "—" },
          { label: "Order date", value: formatDate(so.order_date) },
          {
            label: "From quotation",
            value: quote?.number ? (
              <Link className="text-blue-600 hover:text-blue-700" href={`/quotations?q=${quote.number}`}>{quote.number}</Link>
            ) : "—",
          },
          { label: "Currency", value: so.currency ?? "AED" },
        ]}
      />

      <DocStatGrid
        items={[
          { label: "Order total", value: formatMoney(so.total, so.currency) },
          { label: "Delivered", value: `${deliveredPct}%`, tone: deliveredPct >= 100 ? "success" : undefined },
          { label: "Invoiced", value: `${invoicedPct}%`, tone: invoicedPct >= 100 ? "success" : undefined },
        ]}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{l.product?.name ?? l.description}</div>
                    {l.product?.sku && <div className="text-xs text-muted-foreground font-mono">{l.product.sku}</div>}
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

          <div className="flex justify-end pt-4">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(so.subtotal, so.currency)} />
              {Number(so.discount_total) > 0 && <Row label="Discount" value={`− ${formatMoney(so.discount_total, so.currency)}`} />}
              <Row label="Tax (VAT)" value={formatMoney(so.tax_total, so.currency)} />
              <div className="border-t pt-2 flex justify-between font-semibold text-base">
                <span>Total</span><span className="font-mono">{formatMoney(so.total, so.currency)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {(dnotes.length > 0 || invs.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Delivery notes</CardTitle></CardHeader>
            <CardContent>
              {dnotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {dnotes.map((d) => (
                    <li key={d.id} className="flex items-center justify-between py-2">
                      <Link href={`/delivery-notes/${d.id}`} className="font-mono text-xs text-blue-600 hover:text-blue-700">{d.number}</Link>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={d.status} />
                        <span className="text-xs text-muted-foreground">{formatDate(d.delivery_date)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
            <CardContent>
              {invs.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {invs.map((iv) => (
                    <li key={iv.id} className="flex items-center justify-between py-2">
                      <Link href={`/invoices/${iv.id}`} className="font-mono text-xs text-blue-600 hover:text-blue-700">{iv.number}</Link>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={iv.status} />
                        <span className="font-mono text-xs">{formatMoney(iv.total, iv.currency)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
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
