import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { DocRowActions } from "@/components/doc-row-actions";
import { ilikeTerm } from "@/lib/list-query";
import { canDeleteDoc } from "@/lib/doc-status";
import { SelectionProvider, BulkBar, RowCheck, SelectAllHead } from "@/components/bulk-select";
import { SortHeader } from "@/components/sort-header";
import { resolveSort } from "@/lib/list-sort";
import { deleteDeliveryNote } from "./actions";

export const dynamic = "force-dynamic";

const INACTIVE = "(cancelled,closed)";

const SORTABLE = ["number", "delivery_date", "status", "posted_at", "created_at"] as const;

export default async function DeliveryNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; sort?: string; dir?: string }>;
}) {
  const { q, view = "active", sort, dir } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();
  const order = resolveSort(sort, dir, SORTABLE);

  let query = supabase
    .from("delivery_note")
    .select("id, number, delivery_date, status, posted_at, created_at, sales_order:sales_order(number, customer:customer(name))")
    .order(order.column, { ascending: order.ascending })
    .limit(200);

  if (view === "active") query = query.not("status", "in", INACTIVE);
  else if (view === "inactive") query = query.in("status", ["cancelled", "closed"]);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term}`);

  const { data: rows } = await query;

  const canDelete = perms.has(P.inventory.deliveryDelete);
  const showActions = canDelete;

  const ids = (rows ?? []).map((r) => r.id);
  const csvRows = (rows ?? []).map((r) => {
    const so = r.sales_order as { number?: string; customer?: { name?: string } | null } | null;
    return {
      id: r.id,
      Number: r.number,
      "Sales Order": so?.number ?? "",
      Customer: so?.customer?.name ?? "",
      Date: r.delivery_date,
      Status: r.status,
      Posted: r.posted_at ?? "",
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Delivery Notes</h1>
        <p className="text-sm text-muted-foreground">
          Goods issue documents. Posting a delivery note deducts stock.
        </p>
      </div>

      <ListToolbar searchPlaceholder="Search delivery number…" />

      <SelectionProvider>
      <BulkBar entity="delivery_note" entityLabel="delivery note" csvRows={csvRows} filename="delivery-notes" canDelete={canDelete} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead ids={ids} />
              <SortHeader column="number">Number</SortHeader>
              <TableHead>Sales Order</TableHead>
              <TableHead>Customer</TableHead>
              <SortHeader column="delivery_date">Date</SortHeader>
              <SortHeader column="status">Status</SortHeader>
              <SortHeader column="posted_at">Posted</SortHeader>
              <SortHeader column="created_at">Created</SortHeader>
              {showActions && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 9 : 8} className="text-center text-muted-foreground py-8">
                  {q ? `No delivery notes match “${q}”.` : "No delivery notes here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => {
              const so = r.sales_order as { number?: string; customer?: { name?: string } | null } | null;
              return (
                <TableRow key={r.id}>
                  <RowCheck id={r.id} />
                  <TableCell className="font-mono text-xs">
                    <Link href={`/delivery-notes/${r.id}`} className="text-blue-600 hover:text-blue-700">{r.number}</Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{so?.number ?? "—"}</TableCell>
                  <TableCell>{so?.customer?.name ?? "—"}</TableCell>
                  <TableCell>{formatDate(r.delivery_date)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>{r.posted_at ? formatDate(r.posted_at) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                  {showActions && (
                    <TableCell>
                      <DocRowActions
                        id={r.id}
                        entityLabel="delivery note"
                        canCancel={false}
                        cancelEnabled={false}
                        canDelete={canDelete}
                        deleteEnabled={canDeleteDoc("delivery_note", r.status)}
                        remove={deleteDeliveryNote}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      </SelectionProvider>
    </div>
  );
}
