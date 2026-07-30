// Shared builder for a product's selling/buying units, used by the line-item
// forms. Each product's list is the BASE unit (factor 1) first, then any extra
// units from product_uom. `label` is the UoM code (PCS, BOX, …). `price` is the
// per-unit price for the caller's context: sale price on sales docs, cost price
// on purchase docs (choose via `priceField` — never ship cost to sales users).

export type ProductUnit = { uom_id: string; factor: number; price: number; label: string };

type PriceField = "sale_price" | "cost_price";
type ProductRow = { id: string; uom_id: string; sale_price?: number | string | null; cost_price?: number | string | null };
type ProductUomRow = { product_id: string; uom_id: string; factor: number | string; sale_price?: number | string | null; cost_price?: number | string | null };

export function buildProductUnits(
  products: ProductRow[],
  productUoms: ProductUomRow[],
  uomCode: Map<string, string>,
  priceField: PriceField = "sale_price",
): Map<string, ProductUnit[]> {
  const priceOf = (r: ProductRow | ProductUomRow) => Number(r[priceField] ?? 0);
  const extra = new Map<string, ProductUnit[]>();
  for (const r of productUoms) {
    const list = extra.get(r.product_id) ?? [];
    list.push({ uom_id: r.uom_id, factor: Number(r.factor), price: priceOf(r), label: uomCode.get(r.uom_id) ?? "" });
    extra.set(r.product_id, list);
  }
  const out = new Map<string, ProductUnit[]>();
  for (const p of products) {
    out.set(p.id, [
      { uom_id: p.uom_id, factor: 1, price: priceOf(p), label: uomCode.get(p.uom_id) ?? "" },
      ...(extra.get(p.id) ?? []),
    ]);
  }
  return out;
}
