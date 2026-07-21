import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { DocRowActions } from "@/components/doc-row-actions";
import { ilikeTerm } from "@/lib/list-query";
import { SelectionProvider, BulkBar, RowCheck, SelectAllHead } from "@/components/bulk-select";
import { SortHeader } from "@/components/sort-header";
import { resolveSort } from "@/lib/list-sort";
import { deletePayment } from "./actions";
import { RecordPaymentButton } from "./record-payment-dialog";

export const dynamic = "force-dynamic";

const SORTABLE = ["number", "payment_date", "method", "reference", "amount", "amount_unallocated", "created_at"] as const;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string }>;
}) {
  const { q, sort, dir } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();
  const order = resolveSort(sort, dir, SORTABLE);

  let query = supabase
    .from("payment")
    .select("id, number, payment_date, method, reference, amount, amount_unallocated, currency, created_at, customer:customer(name)")
    .order(order.column, { ascending: order.ascending })
    .limit(200);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term},reference.ilike.${term}`);

  const { data: rows } = await query;

  const canDelete = perms.has(P.invoice.paymentDelete);
  const canCreate = perms.has(P.invoice.paymentCreate);

  const { data: openInv } = canCreate
    ? await supabase
        .from("invoice")
        .select("id, number, balance, currency, customer:customer(name)")
        .gt("balance", 0.001)
        .not("status", "in", "(cancelled,draft)")
        .order("invoice_date", { ascending: false })
        .limit(100)
    : { data: [] };
  const openInvoices = ((openInv ?? []) as Array<{ id: string; number: string; balance: number; currency: string; customer: { name?: string } | null }>).map((i) => ({
    id: i.id,
    number: i.number,
    balance: Number(i.balance),
    currency: i.currency,
    customer: i.customer?.name ?? "—",
  }));

  const ids = (rows ?? []).map((r) => r.id);
  const csvRows = (rows ?? []).map((r) => ({
    id: r.id,
    Number: r.number,
    Customer: (r.customer as { name?: string } | null)?.name ?? "",
    Date: r.payment_date,
    Method: r.method,
    Reference: r.reference ?? "",
    Amount: r.amount,
    Unallocated: r.amount_unallocated,
    Currency: r.currency,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">Receipts from customers, allocated across invoices</p>
        </div>
        {canCreate && <RecordPaymentButton invoices={openInvoices} />}
      </div>

      <ListToolbar showViews={false} searchPlaceholder="Search number or reference…" />

      <SelectionProvider>
      <BulkBar entity="payment" entityLabel="payment" csvRows={csvRows} filename="payments" canDelete={canDelete} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead ids={ids} />
              <SortHeader column="number">Number</SortHeader>
              <TableHead>Customer</TableHead>
              <SortHeader column="payment_date">Date</SortHeader>
              <SortHeader column="method">Method</SortHeader>
              <SortHeader column="reference">Reference</SortHeader>
              <SortHeader column="amount" className="text-right">Amount</SortHeader>
              <SortHeader column="amount_unallocated" className="text-right">Unallocated</SortHeader>
              <SortHeader column="created_at">Created</SortHeader>
              {canDelete && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={canDelete ? 10 : 9} className="text-center text-muted-foreground py-8">
                  {q ? `No payments match “${q}”.` : "No payments here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <RowCheck id={r.id} />
                <TableCell className="font-mono text-xs">{r.number}</TableCell>
                <TableCell className="font-medium">{(r.customer as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>{formatDate(r.payment_date)}</TableCell>
                <TableCell className="capitalize">{r.method?.replace("_", " ")}</TableCell>
                <TableCell className="text-muted-foreground">{r.reference ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.amount, r.currency)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{formatMoney(r.amount_unallocated, r.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                {canDelete && (
                  <TableCell>
                    <DocRowActions
                      id={r.id}
                      entityLabel="payment"
                      canCancel={false}
                      cancelEnabled={false}
                      canDelete={canDelete}
                      deleteEnabled={true}
                      remove={deletePayment}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      </SelectionProvider>
    </div>
  );
}
