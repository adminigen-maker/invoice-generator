import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { cancelQuotation, deleteQuotation } from "./actions";

export const dynamic = "force-dynamic";

const INACTIVE = "(cancelled,closed)";

const SORTABLE = ["number", "quote_date", "valid_until", "status", "total", "created_at"] as const;

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; sort?: string; dir?: string }>;
}) {
  const { q, view = "active", sort, dir } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();
  const order = resolveSort(sort, dir, SORTABLE);

  let query = supabase
    .from("quotation")
    .select("id, number, quote_date, valid_until, status, total, currency, created_at, customer:customer(name)")
    .order(order.column, { ascending: order.ascending })
    .limit(200);

  if (view === "active") query = query.not("status", "in", INACTIVE);
  else if (view === "inactive") query = query.in("status", ["cancelled", "closed"]);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term}`);

  const { data: rows } = await query;

  const canCancel = perms.has(P.sales.quotationEdit);
  const canDelete = perms.has(P.sales.quotationDelete);
  const showActions = canCancel || canDelete;

  const ids = (rows ?? []).map((r) => r.id);
  const csvRows = (rows ?? []).map((r) => ({
    id: r.id,
    Number: r.number,
    Customer: (r.customer as { name?: string } | null)?.name ?? "",
    Date: r.quote_date,
    "Valid until": r.valid_until ?? "",
    Status: r.status,
    Total: r.total,
    Currency: r.currency,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotations</h1>
          <p className="text-sm text-muted-foreground">Sales offers waiting to be confirmed</p>
        </div>
        {perms.has(P.sales.quotationCreate) && (
          <Button asChild>
            <Link href="/quotations/new"><Plus className="h-4 w-4 mr-2" />New quotation</Link>
          </Button>
        )}
      </div>

      <ListToolbar searchPlaceholder="Search quotation number…" />

      <SelectionProvider>
      <BulkBar entity="quotation" entityLabel="quotation" csvRows={csvRows} filename="quotations" canDelete={canDelete} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead ids={ids} />
              <SortHeader column="number">Number</SortHeader>
              <TableHead>Customer</TableHead>
              <SortHeader column="quote_date">Date</SortHeader>
              <SortHeader column="valid_until">Valid until</SortHeader>
              <SortHeader column="status">Status</SortHeader>
              <SortHeader column="total" className="text-right">Total</SortHeader>
              <SortHeader column="created_at">Created</SortHeader>
              {showActions && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 9 : 8} className="text-center text-muted-foreground py-8">
                  {q ? `No quotations match “${q}”.` : "No quotations here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((quote) => (
              <TableRow key={quote.id}>
                <RowCheck id={quote.id} />
                <TableCell className="font-mono text-xs">
                  <Link href={`/quotations/${quote.id}`} className="text-blue-600 hover:text-blue-700">{quote.number}</Link>
                </TableCell>
                <TableCell className="font-medium">
                  {(quote.customer as { name?: string } | null)?.name ?? "—"}
                </TableCell>
                <TableCell>{formatDate(quote.quote_date)}</TableCell>
                <TableCell>{formatDate(quote.valid_until)}</TableCell>
                <TableCell><StatusBadge status={quote.status} /></TableCell>
                <TableCell className="text-right font-mono">{formatMoney(quote.total, quote.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(quote.created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <DocRowActions
                      id={quote.id}
                      entityLabel="quotation"
                      canCancel={canCancel}
                      cancelEnabled={canCancelDoc("quotation", quote.status)}
                      canDelete={canDelete}
                      deleteEnabled={canDeleteDoc("quotation", quote.status)}
                      cancel={cancelQuotation}
                      remove={deleteQuotation}
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
