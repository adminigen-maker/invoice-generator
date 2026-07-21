import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { DocRowActions } from "@/components/doc-row-actions";
import { ilikeTerm } from "@/lib/list-query";
import { SelectionProvider, BulkBar, RowCheck, SelectAllHead } from "@/components/bulk-select";
import { cancelPurchaseOrder, deletePurchaseOrder } from "./actions";

export const dynamic = "force-dynamic";

const INACTIVE = "(cancelled,closed)";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { q, view = "active" } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();

  let query = supabase
    .from("purchase_order")
    .select("id, number, order_date, expected_date, status, total, currency, created_at, vendor_name, vendor:vendor(name)")
    .order("order_date", { ascending: false })
    .limit(200);

  if (view === "active") query = query.not("status", "in", INACTIVE);
  else if (view === "inactive") query = query.in("status", ["cancelled", "closed"]);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term}`);

  const { data: rows } = await query;

  const canCancel = perms.has(P.procurement.poCancel);
  const canDelete = perms.has(P.procurement.poDelete);
  const showActions = canCancel || canDelete;

  const ids = (rows ?? []).map((r) => r.id);
  const csvRows = (rows ?? []).map((r) => ({
    id: r.id,
    Number: r.number,
    Vendor: (r.vendor as { name?: string } | null)?.name ?? (r.vendor_name as string | null) ?? "",
    "Order date": r.order_date,
    Expected: r.expected_date ?? "",
    Status: r.status,
    Total: r.total,
    Currency: r.currency,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">Orders placed with your vendors</p>
        </div>
        {perms.has(P.procurement.poCreate) && (
          <Button asChild>
            <Link href="/purchase-orders/new"><Plus className="h-4 w-4 mr-2" />New purchase order</Link>
          </Button>
        )}
      </div>

      <ListToolbar searchPlaceholder="Search PO number…" />

      <SelectionProvider>
      <BulkBar entity="purchase_order" entityLabel="purchase order" csvRows={csvRows} filename="purchase-orders" canDelete={canDelete} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead ids={ids} />
              <TableHead>Number</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Order date</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Created</TableHead>
              {showActions && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 9 : 8} className="text-center text-muted-foreground py-8">
                  {q ? `No purchase orders match “${q}”.` : "No purchase orders here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <RowCheck id={r.id} />
                <TableCell className="font-mono text-xs">
                  <Link href={`/purchase-orders/${r.id}`} className="text-blue-600 hover:text-blue-700">{r.number}</Link>
                </TableCell>
                <TableCell className="font-medium">{(r.vendor as { name?: string } | null)?.name ?? (r.vendor_name as string | null) ?? "—"}</TableCell>
                <TableCell>{formatDate(r.order_date)}</TableCell>
                <TableCell>{r.expected_date ? formatDate(r.expected_date) : "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.total, r.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <DocRowActions
                      id={r.id}
                      entityLabel="purchase order"
                      canCancel={canCancel}
                      cancelEnabled={["draft", "confirmed"].includes(r.status)}
                      canDelete={canDelete}
                      deleteEnabled={["draft", "cancelled"].includes(r.status)}
                      cancel={cancelPurchaseOrder}
                      remove={deletePurchaseOrder}
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
