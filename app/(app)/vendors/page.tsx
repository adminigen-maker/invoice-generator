import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { RowActions } from "@/components/row-actions";
import { setVendorActive, deleteVendor } from "./actions";
import { ilikeTerm } from "@/lib/list-query";
import { SelectionProvider, BulkBar, RowCheck, SelectAllHead } from "@/components/bulk-select";
import { SortHeader } from "@/components/sort-header";
import { resolveSort } from "@/lib/list-sort";

export const dynamic = "force-dynamic";

const SORTABLE = ["code", "name", "tax_registration_number", "payment_terms_days", "currency", "is_active", "created_at"] as const;

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; sort?: string; dir?: string }>;
}) {
  const { q, view = "active", sort, dir } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();
  const order = resolveSort(sort, dir, SORTABLE);

  let query = supabase
    .from("vendor")
    .select("id, code, name, tax_registration_number, payment_terms_days, currency, is_active, created_at")
    .order(order.column, { ascending: order.ascending })
    .limit(200);

  if (view === "active") query = query.eq("is_active", true);
  else if (view === "inactive") query = query.eq("is_active", false);

  const term = ilikeTerm(q);
  if (term) query = query.or(`code.ilike.${term},name.ilike.${term},tax_registration_number.ilike.${term}`);

  const { data: rows } = await query;

  const canDeactivate = perms.has(P.procurement.vendorEdit);
  const canDelete = perms.has(P.procurement.vendorDelete);
  const showActions = canDeactivate || canDelete;
  const colCount = 8 + (showActions ? 1 : 0);

  const ids = (rows ?? []).map((v) => v.id);
  const csvRows = (rows ?? []).map((v) => ({
    id: v.id,
    Code: v.code,
    Name: v.name,
    TRN: v.tax_registration_number ?? "",
    Terms: v.payment_terms_days ?? 30,
    Currency: v.currency ?? "AED",
    Status: v.is_active ? "Active" : "Inactive",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">Suppliers you purchase goods and services from</p>
        </div>
        {perms.has(P.procurement.vendorCreate) && (
          <Button asChild>
            <Link href="/vendors/new"><Plus className="h-4 w-4 mr-2" />New vendor</Link>
          </Button>
        )}
      </div>

      <ListToolbar searchPlaceholder="Search code, name or TRN…" />

      <SelectionProvider>
      <BulkBar entity="vendor" entityLabel="vendor" csvRows={csvRows} filename="vendors" canDelete={canDelete} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead ids={ids} />
              <SortHeader column="code">Code</SortHeader>
              <SortHeader column="name">Name</SortHeader>
              <SortHeader column="tax_registration_number">TRN</SortHeader>
              <SortHeader column="payment_terms_days">Payment terms</SortHeader>
              <SortHeader column="currency">Currency</SortHeader>
              <SortHeader column="is_active">Status</SortHeader>
              <SortHeader column="created_at">Created</SortHeader>
              {showActions && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">
                  {q ? `No vendors match “${q}”.` : "No vendors here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((v) => (
              <TableRow key={v.id}>
                <RowCheck id={v.id} />
                <TableCell className="font-mono text-xs">{v.code}</TableCell>
                <TableCell className="font-medium">
                  {perms.has(P.procurement.vendorEdit) ? (
                    <Link href={`/vendors/${v.id}`} className="text-blue-600 hover:text-blue-700">{v.name}</Link>
                  ) : v.name}
                </TableCell>
                <TableCell className="font-mono text-xs">{v.tax_registration_number ?? "—"}</TableCell>
                <TableCell>Net {v.payment_terms_days ?? 30}</TableCell>
                <TableCell>{v.currency ?? "AED"}</TableCell>
                <TableCell>
                  {v.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(v.created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <RowActions
                      id={v.id}
                      isActive={!!v.is_active}
                      entityLabel="vendor"
                      canDeactivate={canDeactivate}
                      canDelete={canDelete}
                      setActive={setVendorActive}
                      remove={deleteVendor}
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
