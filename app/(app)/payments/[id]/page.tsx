import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocMetaGrid, DocStatGrid } from "@/components/doc-detail";

type Alloc = {
  amount_allocated: number;
  invoice: {
    id?: string;
    number?: string;
    invoice_date?: string;
    status?: string;
    total?: number;
    balance?: number;
    currency?: string;
    sales_order?: { id?: string; number?: string } | null;
  } | null;
};

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await can(P.invoice.paymentView))) redirect("/");

  const supabase = await createClient();
  const { data: pay } = await supabase
    .from("payment")
    .select(`
      *,
      customer:customer(id, code, name),
      allocations:payment_allocation(
        amount_allocated,
        invoice:invoice(id, number, invoice_date, status, total, balance, currency,
          sales_order:sales_order(id, number))
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (!pay) return notFound();

  const cust = pay.customer as { id?: string; code?: string; name?: string } | null;
  const allocs = (pay.allocations ?? []) as Alloc[];
  const allocated = allocs.reduce((s, a) => s + Number(a.amount_allocated), 0);
  const unallocated = Number(pay.amount_unallocated ?? 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{pay.number}</h1>
          <p className="text-sm text-muted-foreground">
            Receipt from {cust?.name ?? "—"} · {formatDate(pay.payment_date)}
          </p>
        </div>
      </div>

      <DocMetaGrid
        items={[
          {
            label: "Customer",
            value: cust?.id ? (
              <Link href={`/customers/${cust.id}`} className="text-blue-600 hover:text-blue-700">{cust.name}</Link>
            ) : (cust?.name ?? "—"),
          },
          { label: "Date", value: formatDate(pay.payment_date) },
          { label: "Method", value: <span className="capitalize">{String(pay.method ?? "—").replace("_", " ")}</span> },
          { label: "Reference", value: pay.reference ?? "—" },
        ]}
      />

      <DocStatGrid
        items={[
          { label: "Amount received", value: formatMoney(pay.amount, pay.currency) },
          { label: "Applied to invoices", value: formatMoney(allocated, pay.currency), tone: "success" },
          {
            label: "Unallocated",
            value: formatMoney(unallocated, pay.currency),
            tone: unallocated > 0.001 ? "danger" : undefined,
          },
        ]}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Applied to</CardTitle></CardHeader>
        <CardContent>
          {allocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">This receipt hasn&apos;t been applied to any invoice yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Sales order</TableHead>
                  <TableHead>Invoice date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Invoice total</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                  <TableHead className="text-right">Still due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocs.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">
                      {a.invoice?.id ? (
                        <Link href={`/invoices/${a.invoice.id}`} className="text-blue-600 hover:text-blue-700">{a.invoice.number}</Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.invoice?.sales_order?.id ? (
                        <Link href={`/sales-orders/${a.invoice.sales_order.id}`} className="text-blue-600 hover:text-blue-700">
                          {a.invoice.sales_order.number}
                        </Link>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{formatDate(a.invoice?.invoice_date)}</TableCell>
                    <TableCell><StatusBadge status={a.invoice?.status} /></TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(a.invoice?.total ?? 0, a.invoice?.currency)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{formatMoney(a.amount_allocated, pay.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(a.invoice?.balance ?? 0, a.invoice?.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pay.notes && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{pay.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
