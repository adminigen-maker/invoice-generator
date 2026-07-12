import { redirect } from "next/navigation";
import { Boxes, AlertTriangle, PackageX } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export default async function InventoryPage() {
  if (!(await can(P.inventory.stockView))) redirect("/");

  const supabase = await createClient();
  const { data } = await supabase.rpc("stock_on_hand");
  const rows = ((data as StockRow[] | null) ?? []).map((r) => ({ ...r, on_hand: Number(r.on_hand) }));

  const lowCount = rows.filter((r) => r.reorder_point != null && r.on_hand <= Number(r.reorder_point)).length;
  const outCount = rows.filter((r) => r.on_hand <= 0).length;
  const hasCost = rows.some((r) => r.cost_price != null);
  const totalValue = rows.reduce((s, r) => s + (r.cost_price != null ? r.on_hand * Number(r.cost_price) : 0), 0);

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={hasCost ? 7 : 6} className="text-center text-muted-foreground py-8">
                  No stockable products yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const rp = r.reorder_point != null ? Number(r.reorder_point) : null;
              const status =
                r.on_hand <= 0 ? "out" : rp != null && r.on_hand <= rp ? "low" : "ok";
              return (
                <TableRow key={r.product_id}>
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
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
