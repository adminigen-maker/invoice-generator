import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { DocRowActions } from "@/components/doc-row-actions";
import { ilikeTerm } from "@/lib/list-query";
import { deletePayment } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();

  let query = supabase
    .from("payment")
    .select("id, number, payment_date, method, reference, amount, amount_unallocated, currency, created_at, customer:customer(name)")
    .order("payment_date", { ascending: false })
    .limit(200);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term},reference.ilike.${term}`);

  const { data: rows } = await query;

  const canDelete = perms.has(P.invoice.paymentDelete);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Receipts from customers, allocated across invoices</p>
      </div>

      <ListToolbar showViews={false} searchPlaceholder="Search number or reference…" />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Unallocated</TableHead>
              <TableHead>Created</TableHead>
              {canDelete && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={canDelete ? 9 : 8} className="text-center text-muted-foreground py-8">
                  {q ? `No payments match “${q}”.` : "No payments here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
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
    </div>
  );
}
