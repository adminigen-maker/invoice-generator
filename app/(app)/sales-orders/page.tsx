import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { DocRowActions } from "@/components/doc-row-actions";
import { ilikeTerm } from "@/lib/list-query";
import { canCancelDoc, canDeleteDoc } from "@/lib/doc-status";
import { SelectionProvider, BulkBar, RowCheck, SelectAllHead } from "@/components/bulk-select";
import { SortHeader } from "@/components/sort-header";
import { resolveSort } from "@/lib/list-sort";
import { cancelSalesOrder, deleteSalesOrder } from "./actions";

export const dynamic = "force-dynamic";

const INACTIVE = "(cancelled,closed)";

const SORTABLE = ["number", "order_date", "status", "total", "created_at"] as const;

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; sort?: string; dir?: string }>;
}) {
  const { q, view = "active", sort, dir } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();
  const order = resolveSort(sort, dir, SORTABLE);

  let query = supabase
    .from("sales_order")
    .select("id, number, order_date, status, total, currency, created_at, customer:customer(name)")
    .order(order.column, { ascending: order.ascending })
    .limit(200);

  if (view === "active") query = query.not("status", "in", INACTIVE);
  else if (view === "inactive") query = query.in("status", ["cancelled", "closed"]);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term}`);

  const { data: rows } = await query;

  const canCancel = perms.has(P.sales.orderEdit);
  const canDelete = perms.has(P.sales.orderDelete);
  const showActions = canCancel || canDelete;

  const ids = (rows ?? []).map((r) => r.id);
  const csvRows = (rows ?? []).map((r) => ({
    id: r.id,
    Number: r.number,
    Customer: (r.customer as { name?: string } | null)?.name ?? "",
    Date: r.order_date,
    Status: r.status,
    Total: r.total,
    Currency: r.currency,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales Orders</h1>
        <p className="text-sm text-muted-foreground">Confirmed customer commitments awaiting delivery & invoicing</p>
      </div>

      <ListToolbar searchPlaceholder="Search order number…" />

      <SelectionProvider>
      <BulkBar entity="sales_order" entityLabel="sales order" csvRows={csvRows} filename="sales-orders" canDelete={canDelete} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead ids={ids} />
              <SortHeader column="number">Number</SortHeader>
              <TableHead>Customer</TableHead>
              <SortHeader column="order_date">Date</SortHeader>
              <SortHeader column="status">Status</SortHeader>
              <SortHeader column="total" className="text-right">Total</SortHeader>
              <SortHeader column="created_at">Created</SortHeader>
              {showActions && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 8 : 7} className="text-center text-muted-foreground py-8">
                  {q ? `No sales orders match “${q}”.` : "No sales orders here. Confirm a quotation to create one."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <RowCheck id={r.id} />
                <TableCell className="font-mono text-xs">
                  <Link href={`/sales-orders/${r.id}`} className="text-blue-600 hover:text-blue-700">{r.number}</Link>
                </TableCell>
                <TableCell className="font-medium">{(r.customer as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>{formatDate(r.order_date)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.total, r.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <DocRowActions
                      id={r.id}
                      entityLabel="sales order"
                      canCancel={canCancel}
                      cancelEnabled={canCancelDoc("sales_order", r.status)}
                      canDelete={canDelete}
                      deleteEnabled={canDeleteDoc("sales_order", r.status)}
                      cancel={cancelSalesOrder}
                      remove={deleteSalesOrder}
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
