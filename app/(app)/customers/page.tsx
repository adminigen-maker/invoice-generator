import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { RowActions } from "@/components/row-actions";
import { SelectionProvider, BulkBar, RowCheck, SelectAllHead } from "@/components/bulk-select";
import { SortHeader } from "@/components/sort-header";
import { resolveSort } from "@/lib/list-sort";
import { setCustomerActive, deleteCustomer } from "./actions";
import { ilikeTerm } from "@/lib/list-query";

export const dynamic = "force-dynamic";

const SORTABLE = ["code", "name", "tax_registration_number", "credit_limit", "payment_terms_days", "is_active", "created_at"] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; sort?: string; dir?: string }>;
}) {
  const { q, view = "active", sort, dir } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();
  const order = resolveSort(sort, dir, SORTABLE);

  let query = supabase
    .from("customer")
    .select("id, code, name, tax_registration_number, credit_limit, payment_terms_days, is_active, created_at")
    .order(order.column, { ascending: order.ascending })
    .limit(200);

  if (view === "active") query = query.eq("is_active", true);
  else if (view === "inactive") query = query.eq("is_active", false);

  const term = ilikeTerm(q);
  if (term) query = query.or(`code.ilike.${term},name.ilike.${term},tax_registration_number.ilike.${term}`);

  const { data: rows } = await query;

  const canDeactivate = perms.has(P.sales.customerEdit);
  const canDelete = perms.has(P.sales.customerDelete);
  const showActions = canDeactivate || canDelete;
  const colCount = 8 + (showActions ? 1 : 0);

  const ids = (rows ?? []).map((r) => r.id);
  const csvRows = (rows ?? []).map((r) => ({
    id: r.id,
    Code: r.code,
    Name: r.name,
    TRN: r.tax_registration_number ?? "",
    "Credit limit": r.credit_limit,
    "Payment terms": r.payment_terms_days ?? 30,
    Status: r.is_active ? "Active" : "Inactive",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">Master data for billing counterparties</p>
        </div>
        {perms.has(P.sales.customerCreate) && (
          <Button asChild>
            <Link href="/customers/new"><Plus className="h-4 w-4 mr-2" />New customer</Link>
          </Button>
        )}
      </div>

      <ListToolbar searchPlaceholder="Search code, name or TRN…" />

      <SelectionProvider>
      <BulkBar entity="customer" entityLabel="customer" csvRows={csvRows} filename="customers" canDelete={canDelete} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead ids={ids} />
              <SortHeader column="code">Code</SortHeader>
              <SortHeader column="name">Name</SortHeader>
              <SortHeader column="tax_registration_number">TRN</SortHeader>
              <SortHeader column="credit_limit" className="text-right">Credit limit</SortHeader>
              <SortHeader column="payment_terms_days">Payment terms</SortHeader>
              <SortHeader column="is_active">Status</SortHeader>
              <SortHeader column="created_at">Created</SortHeader>
              {showActions && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">
                  {q ? `No customers match “${q}”.` : "No customers here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((c) => (
              <TableRow key={c.id}>
                <RowCheck id={c.id} />
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="font-medium">
                  {perms.has(P.sales.customerEdit) ? (
                    <Link href={`/customers/${c.id}`} className="text-blue-600 hover:text-blue-700">{c.name}</Link>
                  ) : c.name}
                </TableCell>
                <TableCell className="font-mono text-xs">{c.tax_registration_number ?? "—"}</TableCell>
                <TableCell className="text-right">{formatMoney(c.credit_limit)}</TableCell>
                <TableCell>Net {c.payment_terms_days ?? 30}</TableCell>
                <TableCell>
                  {c.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(c.created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <RowActions
                      id={c.id}
                      isActive={!!c.is_active}
                      entityLabel="customer"
                      canDeactivate={canDeactivate}
                      canDelete={canDelete}
                      setActive={setCustomerActive}
                      remove={deleteCustomer}
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
