import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { DocRowActions } from "@/components/doc-row-actions";
import { ilikeTerm } from "@/lib/list-query";
import { canCancelDoc, canDeleteDoc } from "@/lib/doc-status";
import { cancelInvoice, deleteInvoice } from "./actions";

export const dynamic = "force-dynamic";

const INACTIVE = "(cancelled,closed)";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { q, view = "active" } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();

  let query = supabase
    .from("invoice")
    .select("id, number, invoice_date, due_date, status, total, amount_paid, balance, currency, created_at, customer:customer(name)")
    .order("invoice_date", { ascending: false })
    .limit(200);

  if (view === "active") query = query.not("status", "in", INACTIVE);
  else if (view === "inactive") query = query.in("status", ["cancelled", "closed"]);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term}`);

  const { data: rows } = await query;

  const canCancel = perms.has(P.invoice.edit);
  const canDelete = perms.has(P.invoice.void);
  const showActions = canCancel || canDelete;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Bills issued to customers. Post to lock; then record payments.
        </p>
      </div>

      <ListToolbar searchPlaceholder="Search invoice number…" />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Created</TableHead>
              {showActions && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 9 : 8} className="text-center text-muted-foreground py-8">
                  {q ? `No invoices match “${q}”.` : "No invoices here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/invoices/${r.id}`} className="hover:underline">{r.number}</Link>
                </TableCell>
                <TableCell className="font-medium">{(r.customer as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>{formatDate(r.invoice_date)}</TableCell>
                <TableCell>{formatDate(r.due_date)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.total, r.currency)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.balance, r.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <DocRowActions
                      id={r.id}
                      entityLabel="invoice"
                      canCancel={canCancel}
                      cancelEnabled={canCancelDoc("invoice", r.status)}
                      canDelete={canDelete}
                      deleteEnabled={canDeleteDoc("invoice", r.status)}
                      cancel={cancelInvoice}
                      remove={deleteInvoice}
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
