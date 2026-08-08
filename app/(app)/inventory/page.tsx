import { redirect } from "next/navigation";
import { Boxes, AlertTriangle, PackageX } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatMoney, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { SelectFilter } from "@/components/select-filter";
import { SortHeader } from "@/components/sort-header";
import { resolveSort } from "@/lib/list-sort";
import { buildProductUnits } from "@/lib/product-units";
import { AdjustStockButton } from "./adjust-stock-button";

export const dynamic = "force-dynamic";

// stock_on_hand returns one row per stockable product, counted in base units.
type StockRow = {
  product_id: string;
  sku: string;
  name: string;
  uom: string | null;
  on_hand: number;
  reorder_point: number | null;
  cost_price: number | null;
};

// Row enriched with the product's created_at + category (joined in the app, so
// no change to the RPC is needed) — that's what lets us sort/filter here.
type Row = StockRow & { created_at: string | null; category_id: string | null; category: string | null };

// stock_on_hand has no created_at/category to order by, so we sort the rows in
// the app. Same param names as the DB-backed lists, matched by SortHeader.
const SORTABLE = ["sku", "name", "on_hand", "reorder_point", "value", "created_at"] as const;

/** in-stock / low / out — derived from on-hand vs the product's reorder point. */
function stockStatus(r: { on_hand: number; reorder_point: number | null }): "out" | "low" | "ok" {
  if (r.on_hand <= 0) return "out";
  if (r.reorder_point != null && r.on_hand <= Number(r.reorder_point)) return "low";
  return "ok";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; uom?: string; status?: string; category?: string; sort?: string; dir?: string }>;
}) {
  if (!(await can(P.inventory.stockView))) redirect("/");
  const { q, uom, status, category, sort, dir } = await searchParams;
  const order = resolveSort(sort, dir, SORTABLE);

  const supabase = await createClient();
  const canAdjust = await can(P.inventory.stockAdjust);
  const [{ data }, { data: products }, { data: productUoms }, { data: uomRows }, { data: categories }] = await Promise.all([
    supabase.rpc("stock_on_hand"),
    supabase.from("product").select("id, uom_id, sale_price, created_at, category_id, category:product_category(name)").eq("is_active", true),
    supabase.from("product_uom").select("product_id, uom_id, factor, sale_price").eq("is_active", true).order("sequence"),
    supabase.from("unit_of_measure").select("id, code"),
    supabase.from("product_category").select("id, name").order("name"),
  ]);

  // Product metadata (created + category) keyed by id, to enrich the stock rows.
  const meta = new Map(
    (products ?? []).map((p) => [
      p.id,
      {
        created_at: (p as { created_at?: string | null }).created_at ?? null,
        category_id: (p as { category_id?: string | null }).category_id ?? null,
        category: ((p as { category?: { name?: string } | null }).category)?.name ?? null,
      },
    ])
  );
  const all: Row[] = ((data as StockRow[] | null) ?? []).map((r) => ({
    ...r,
    on_hand: Number(r.on_hand),
    created_at: meta.get(r.product_id)?.created_at ?? null,
    category_id: meta.get(r.product_id)?.category_id ?? null,
    category: meta.get(r.product_id)?.category ?? null,
  }));

  // Each product's units (base first) so we can adjust in — and display — any unit.
  const uomCode = new Map((uomRows ?? []).map((u) => [u.id, u.code]));
  const unitsByProduct = buildProductUnits(products ?? [], productUoms ?? [], uomCode);
  const unitsOf = (productId: string) =>
    (unitsByProduct.get(productId) ?? []).map((u) => ({ uom_id: u.uom_id, factor: u.factor, label: u.label }));
  // Every unit code a product can be transacted in (base + any added packs), so
  // the Unit filter offers BOX/CARTON too — not just each product's base unit.
  const codesByProduct = new Map(
    Array.from(unitsByProduct.entries()).map(([pid, units]) => [pid, new Set(units.map((u) => u.label).filter(Boolean))])
  );
  const tidy = (n: number) => String(Number(n.toFixed(2)));

  // Stats reflect the whole catalogue; the table below reflects the filters.
  const lowCount = all.filter((r) => stockStatus(r) === "low").length;
  const outCount = all.filter((r) => r.on_hand <= 0).length;
  const hasCost = all.some((r) => r.cost_price != null);
  const totalValue = all.reduce((s, r) => s + (r.cost_price != null ? r.on_hand * Number(r.cost_price) : 0), 0);
  const valueOf = (r: Row) => (r.cost_price != null ? r.on_hand * Number(r.cost_price) : 0);

  const uomOptions = Array.from(
    new Set([
      ...(all.map((r) => r.uom).filter(Boolean) as string[]),
      ...Array.from(codesByProduct.values()).flatMap((s) => Array.from(s)),
    ])
  )
    .sort()
    .map((u) => ({ value: u, label: u }));
  const categoryOptions = (categories ?? []).map((c) => ({ value: c.id, label: c.name }));

  const term = (q ?? "").trim().toLowerCase();
  const filtered = all.filter((r) => {
    if (category && r.category_id !== category) return false;
    if (uom && r.uom !== uom && !(codesByProduct.get(r.product_id)?.has(uom) ?? false)) return false;
    if (status && stockStatus(r) !== status) return false;
    if (term && !`${r.sku} ${r.name}`.toLowerCase().includes(term)) return false;
    return true;
  });

  // Sort in the app (RPC data). Default = newest-created first, like the other lists.
  const rows = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (order.column) {
      case "sku": cmp = a.sku.localeCompare(b.sku); break;
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "on_hand": cmp = a.on_hand - b.on_hand; break;
      case "reorder_point": cmp = Number(a.reorder_point ?? 0) - Number(b.reorder_point ?? 0); break;
      case "value": cmp = valueOf(a) - valueOf(b); break;
      case "created_at":
      default: cmp = String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")); break;
    }
    return order.ascending ? cmp : -cmp;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Live stock on hand across your warehouse locations.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<Boxes className="h-4 w-4 text-sky-500" />} label="Stocked items" value={rows.length.toString()} />
        <Stat icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} label="At / below reorder" value={lowCount.toString()} />
        <Stat icon={<PackageX className="h-4 w-4 text-destructive" />} label="Out of stock" value={outCount.toString()} />
        {hasCost && <Stat icon={<Boxes className="h-4 w-4 text-emerald-500" />} label="Stock value" value={formatMoney(totalValue)} />}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <SelectFilter
          param="category"
          label="Category"
          options={categoryOptions}
          allLabel="All categories"
          className="w-52"
        />
        <SelectFilter
          param="uom"
          label="Unit"
          options={uomOptions}
          allLabel="All units"
          className="w-36"
        />
        <SelectFilter
          param="status"
          label="Stock status"
          options={[
            { value: "ok", label: "In stock" },
            { value: "low", label: "At / below reorder" },
            { value: "out", label: "Out of stock" },
          ]}
          allLabel="All statuses"
          className="w-48"
        />
        {/* Spacer label keeps the search box aligned with the labelled dropdowns. */}
        <div className="ml-auto w-full sm:w-72 space-y-1">
          <span aria-hidden className="hidden sm:block text-xs invisible">Search</span>
          <ListToolbar showViews={false} searchPlaceholder="Search SKU or product…" />
        </div>
      </div>

      {rows.length !== all.length && (
        <p className="text-xs text-muted-foreground -mt-2">
          Showing {rows.length} of {all.length} items. The cards above cover all stock.
        </p>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader column="sku">SKU</SortHeader>
              <SortHeader column="name">Product</SortHeader>
              <TableHead>Category</TableHead>
              <TableHead>UoM</TableHead>
              <SortHeader column="on_hand" className="text-right">On hand</SortHeader>
              <SortHeader column="reorder_point" className="text-right">Reorder point</SortHeader>
              {hasCost && <SortHeader column="value" className="text-right">Value</SortHeader>}
              <TableHead>Status</TableHead>
              <SortHeader column="created_at">Created</SortHeader>
              {canAdjust && <TableHead className="text-right w-28">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={(hasCost ? 8 : 7) + (canAdjust ? 1 : 0)} className="text-center text-muted-foreground py-8">
                  {all.length === 0 ? "No stockable products yet." : "No items match these filters."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const rp = r.reorder_point != null ? Number(r.reorder_point) : null;
              const st = stockStatus(r);
              return (
                <TableRow key={r.product_id}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.category ?? "—"}</TableCell>
                  <TableCell>{r.uom ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">
                    {tidy(r.on_hand)}
                    {(() => {
                      const extras = unitsOf(r.product_id).filter((u) => u.factor > 1);
                      if (!extras.length) return null;
                      return (
                        <div className="text-[11px] text-muted-foreground font-normal">
                          {extras.map((u) => `${tidy(r.on_hand / u.factor)} ${u.label}`).join(" · ")}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{rp != null ? rp.toFixed(2) : "—"}</TableCell>
                  {hasCost && (
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {r.cost_price != null ? formatMoney(r.on_hand * Number(r.cost_price)) : "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    {st === "out" ? (
                      <Badge variant="destructive">Out of stock</Badge>
                    ) : st === "low" ? (
                      <Badge variant="warning">Low</Badge>
                    ) : (
                      <Badge variant="success">In stock</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
                  {canAdjust && (
                    <TableCell className="text-right">
                      <AdjustStockButton productId={r.product_id} name={r.name} currentQty={r.on_hand} uom={r.uom} units={unitsOf(r.product_id)} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">{icon}{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
