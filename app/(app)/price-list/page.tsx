import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { SelectFilter } from "@/components/select-filter";
import { ilikeTerm } from "@/lib/list-query";
import { PriceListExport, type PriceRow } from "./export";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price list" };

type UnitRow = { sequence: number; factor: number; sale_price: number; cost_price?: number; uom?: { code?: string } | null };
type ProductRow = {
  id: string; sku: string; name: string; sale_price: number; cost_price?: number;
  uom?: { code?: string } | null; category?: { name?: string } | null; units?: UnitRow[];
};

export default async function PriceListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  if (!(await can(P.inventory.productView))) redirect("/");
  const { q, category } = await searchParams;
  const supabase = await createClient();
  const canCost = await can(P.inventory.productViewCost);

  const { data: categories } = await supabase.from("product_category").select("id, name").order("name");

  const unitsSel = canCost
    ? "units:product_uom(sequence, factor, sale_price, cost_price, uom:unit_of_measure(code))"
    : "units:product_uom(sequence, factor, sale_price, uom:unit_of_measure(code))";
  let pq = supabase
    .from("product")
    .select(`id, sku, name, sale_price${canCost ? ", cost_price" : ""}, uom:unit_of_measure(code), category:product_category(name), ${unitsSel}`)
    .eq("is_active", true)
    .order("name")
    .limit(500);
  if (category) pq = pq.eq("category_id", category);
  const term = ilikeTerm(q);
  if (term) pq = pq.or(`sku.ilike.${term},name.ilike.${term}`);

  const { data: products } = await pq;

  // Flatten to one row per product-unit: base unit first, then extras.
  const rows: PriceRow[] = [];
  for (const p of (products ?? []) as unknown as ProductRow[]) {
    const cat = p.category?.name ?? "—";
    rows.push({ sku: p.sku, name: p.name, category: cat, unit: p.uom?.code ?? "", factor: 1, sale: Number(p.sale_price), cost: canCost ? Number(p.cost_price ?? 0) : null });
    for (const u of (p.units ?? []).slice().sort((a, b) => a.sequence - b.sequence)) {
      rows.push({ sku: p.sku, name: p.name, category: cat, unit: u.uom?.code ?? "", factor: Number(u.factor), sale: Number(u.sale_price), cost: canCost ? Number(u.cost_price ?? 0) : null });
    }
  }
  const colCount = 5 + (canCost ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Price list</h1>
          <p className="text-sm text-muted-foreground">Every product and the price of each of its units.</p>
        </div>
        <PriceListExport rows={rows} withCost={canCost} />
      </div>

      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <SelectFilter
          param="category"
          label="Category"
          options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
          allLabel="All categories"
          className="w-52"
        />
        <div className="ml-auto w-full sm:w-auto sm:min-w-[360px]">
          <ListToolbar showViews={false} searchPlaceholder="Search SKU or product…" />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Sale price</TableHead>
              {canCost && <TableHead className="text-right">Cost price</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">
                  {q || category ? "No products match these filters." : "No active products yet."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={`${r.sku}-${r.unit}-${i}`}>
                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.category}</TableCell>
                <TableCell>
                  {r.unit || "—"}
                  {r.factor !== 1 && <span className="text-[11px] text-muted-foreground"> = {r.factor}</span>}
                </TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.sale)}</TableCell>
                {canCost && <TableCell className="text-right font-mono text-muted-foreground">{formatMoney(r.cost ?? 0)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
