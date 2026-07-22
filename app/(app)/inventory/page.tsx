import { redirect } from "next/navigation";
import { Boxes, AlertTriangle, PackageX } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { SelectFilter } from "@/components/select-filter";
import { AdjustStockButton } from "./adjust-stock-button";

export const dynamic = "force-dynamic";

type StockRow = {
  product_id: string;
  sku: string;
  name: string;
  uom: string | null;
  on_hand: number;
  reorder_point: number | null;
  cost_price: number | null;
};

/** in-stock / low / out — derived from on-hand vs the product's reorder point. */
function stockStatus(r: { on_hand: number; reorder_point: number | null }): "out" | "low" | "ok" {
  if (r.on_hand <= 0) return "out";
  if (r.reorder_point != null && r.on_hand <= Number(r.reorder_point)) return "low";
  return "ok";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; uom?: string; status?: string }>;
}) {
  if (!(await can(P.inventory.stockView))) redirect("/");
  const { q, uom, status } = await searchParams;

  const supabase = await createClient();
  const canAdjust = await can(P.inventory.stockAdjust);
  const { data } = await supabase.rpc("stock_on_hand");
  const all = ((data as StockRow[] | null) ?? []).map((r) => ({ ...r, on_hand: Number(r.on_hand) }));

  // Stock added today (via a Purchase Order receipt or a manual adjustment) —
  // shown as a small note for that calendar day only; gone again tomorrow.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: stockLocs } = await supabase.from("location").select("id").eq("kind", "stock");
  const stockLocIds = (stockLocs ?? []).map((l) => l.id);
  const { data: todaysAdditions } = stockLocIds.length
    ? await supabase
        .from("stock_move")
        .select("product_id, quantity")
        .in("reference_type", ["purchase_order", "adjustment"])
        .in("dest_location_id", stockLocIds)
        .gte("created_at", todayStart.toISOString())
    : { data: [] };
  const addedTodayByProduct = new Map<string, number>();
  for (const m of (todaysAdditions ?? []) as Array<{ product_id: string; quantity: number }>) {
    addedTodayByProduct.set(m.product_id, (addedTodayByProduct.get(m.product_id) ?? 0) + Number(m.quantity));
  }

  // Stats reflect the whole catalogue; the table below reflects the filters.
  const lowCount = all.filter((r) => stockStatus(r) === "low").length;
  const outCount = all.filter((r) => r.on_hand <= 0).length;
  const hasCost = all.some((r) => r.cost_price != null);
  const totalValue = all.reduce((s, r) => s + (r.cost_price != null ? r.on_hand * Number(r.cost_price) : 0), 0);

  const uomOptions = Array.from(new Set(all.map((r) => r.uom).filter(Boolean) as string[]))
    .sort()
    .map((u) => ({ value: u, label: u }));

  const term = (q ?? "").trim().toLowerCase();
  const rows = all.filter((r) => {
    if (uom && r.uom !== uom) return false;
    if (status && stockStatus(r) !== status) return false;
    if (term && !`${r.sku} ${r.name}`.toLowerCase().includes(term)) return false;
    return true;
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
        <div className="ml-auto w-full sm:w-72">
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
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>UoM</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Reorder point</TableHead>
              {hasCost && <TableHead className="text-right">Value</TableHead>}
              <TableHead>Status</TableHead>
              {canAdjust && <TableHead className="text-right w-28">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={(hasCost ? 7 : 6) + (canAdjust ? 1 : 0)} className="text-center text-muted-foreground py-8">
                  {all.length === 0 ? "No stockable products yet." : "No items match these filters."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const rp = r.reorder_point != null ? Number(r.reorder_point) : null;
              const status =
                r.on_hand <= 0 ? "out" : rp != null && r.on_hand <= rp ? "low" : "ok";
              const addedToday = addedTodayByProduct.get(r.product_id);
              return (
                <TableRow key={r.product_id}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="font-medium">
                    <div>{r.name}</div>
                    {addedToday != null && (
                      <div className="text-[11px] font-normal text-emerald-600">
                        Stock added: +{addedToday.toFixed(0)} {r.uom ?? ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{r.uom ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.on_hand.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{rp != null ? rp.toFixed(2) : "—"}</TableCell>
                  {hasCost && (
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {r.cost_price != null ? formatMoney(r.on_hand * Number(r.cost_price)) : "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    {status === "out" ? (
                      <Badge variant="destructive">Out of stock</Badge>
                    ) : status === "low" ? (
                      <Badge variant="warning">Low</Badge>
                    ) : (
                      <Badge variant="success">In stock</Badge>
                    )}
                  </TableCell>
                  {canAdjust && (
                    <TableCell className="text-right">
                      <AdjustStockButton productId={r.product_id} name={r.name} currentQty={r.on_hand} uom={r.uom} />
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
