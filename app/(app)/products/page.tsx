import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { maskFields } from "@/lib/rbac/field-filter";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ListToolbar } from "@/components/list-toolbar";
import { RowActions } from "@/components/row-actions";
import { SelectionProvider, BulkBar, RowCheck, SelectAllHead } from "@/components/bulk-select";
import { SortHeader } from "@/components/sort-header";
import { SelectFilter } from "@/components/select-filter";
import { resolveSort } from "@/lib/list-sort";
import { setProductActive, deleteProduct } from "./actions";
import { ilikeTerm } from "@/lib/list-query";

export const dynamic = "force-dynamic";

const SORTABLE = ["sku", "name", "sale_price", "cost_price", "is_active", "created_at"] as const;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; sort?: string; dir?: string; category?: string }>;
}) {
  const { q, view = "active", sort, dir, category } = await searchParams;
  const supabase = await createClient();
  const perms = await getPermissions();
  const order = resolveSort(sort, dir, SORTABLE);

  const { data: categories } = await supabase.from("product_category").select("id, name").order("name");

  let query = supabase
    .from("product")
    .select("id, sku, name, sale_price, cost_price, last_purchase_price, is_active, created_at, uom:unit_of_measure(code), category:product_category(name)")
    .order(order.column, { ascending: order.ascending })
    .limit(200);

  if (view === "active") query = query.eq("is_active", true);
  else if (view === "inactive") query = query.eq("is_active", false);
  if (category) query = query.eq("category_id", category);

  const term = ilikeTerm(q);
  if (term) query = query.or(`sku.ilike.${term},name.ilike.${term}`);

  const { data: rows } = await query;
  const masked = (await maskFields("product", rows ?? [])) as typeof rows;

  const canDeactivate = perms.has(P.inventory.productEdit);
  const canDelete = perms.has(P.inventory.productDelete);
  const showActions = canDeactivate || canDelete;
  const colCount = 9 + (perms.has(P.inventory.productViewCost) ? 1 : 0) + (showActions ? 1 : 0);

  const ids = (masked ?? []).map((r) => r.id);
  const csvRows = (masked ?? []).map((r) => ({
    id: r.id,
    SKU: r.sku,
    Name: r.name,
    Category: (r.category as { name?: string } | null)?.name ?? "",
    UoM: (r.uom as { code?: string } | null)?.code ?? "",
    "Sale price": r.sale_price,
    Status: r.is_active ? "Active" : "Inactive",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Catalog of items available on sales & purchase docs</p>
        </div>
        {perms.has(P.inventory.productCreate) && (
          <Button asChild>
            <Link href="/products/new"><Plus className="h-4 w-4 mr-2" />New product</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <SelectFilter
          param="category"
          label="Category"
          options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
          allLabel="All categories"
          className="w-52"
        />
        <div className="ml-auto w-full sm:w-auto sm:min-w-[420px]">
          <ListToolbar searchPlaceholder="Search SKU or name…" />
        </div>
      </div>

      <SelectionProvider>
      <BulkBar entity="product" entityLabel="product" csvRows={csvRows} filename="products" canDelete={canDelete} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SelectAllHead ids={ids} />
              <SortHeader column="sku">SKU</SortHeader>
              <SortHeader column="name">Name</SortHeader>
              <TableHead>Category</TableHead>
              <TableHead>UoM</TableHead>
              <SortHeader column="sale_price" className="text-right">Sale price</SortHeader>
              {perms.has(P.inventory.productViewCost) && (
                <SortHeader column="cost_price" className="text-right">Cost price</SortHeader>
              )}
              <SortHeader column="is_active">Status</SortHeader>
              <SortHeader column="created_at">Created</SortHeader>
              {showActions && <TableHead className="text-right w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(masked ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">
                  {q ? `No products match “${q}”.` : "No products here. "}
                  {!q && perms.has(P.inventory.productCreate) && (
                    <Link className="text-blue-600 hover:text-blue-700" href="/products/new">Create the first one</Link>
                  )}
                </TableCell>
              </TableRow>
            )}
            {(masked ?? []).map((p) => (
              <TableRow key={p.id}>
                <RowCheck id={p.id} />
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2 flex-wrap">
                    {perms.has(P.inventory.productEdit) ? (
                      <Link href={`/products/${p.id}`} className="text-blue-600 hover:text-blue-700">{p.name}</Link>
                    ) : p.name}
                    {(() => {
                      const lpp = (p as { last_purchase_price?: number | null }).last_purchase_price;
                      const cost = (p as { cost_price?: number | null }).cost_price;
                      // Show a "Last buy" badge on any product that's been purchased;
                      // turn it amber with an arrow only when the price differs from cost.
                      if (!perms.has(P.inventory.productViewCost) || lpp == null) return null;
                      const differs = cost != null && Math.abs(Number(lpp) - Number(cost)) > 0.005;
                      const up = cost != null && Number(lpp) > Number(cost);
                      return (
                        <Badge
                          variant={differs ? "warning" : "secondary"}
                          className="font-normal whitespace-nowrap"
                          title={
                            differs
                              ? `Last purchased at ${formatMoney(Number(lpp))} vs master cost ${formatMoney(Number(cost))}`
                              : `Last purchased at ${formatMoney(Number(lpp))}`
                          }
                        >
                          Last buy {formatMoney(Number(lpp))}{differs ? (up ? " ↑" : " ↓") : ""}
                        </Badge>
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell>{(p.category as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>{(p.uom as { code?: string } | null)?.code ?? "—"}</TableCell>
                <TableCell className="text-right">{formatMoney(p.sale_price)}</TableCell>
                {perms.has(P.inventory.productViewCost) && (
                  <TableCell className="text-right text-muted-foreground">{formatMoney((p as { cost_price?: number }).cost_price)}</TableCell>
                )}
                <TableCell>
                  {p.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate((p as { created_at?: string }).created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <RowActions
                      id={p.id}
                      isActive={!!p.is_active}
                      entityLabel="product"
                      canDeactivate={canDeactivate}
                      canDelete={canDelete}
                      setActive={setProductActive}
                      remove={deleteProduct}
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
