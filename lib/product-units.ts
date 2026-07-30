// Shared builder for a product's selling units, used by the line-item forms.
// Each product's list is the BASE unit (factor 1, base sale price) first, then
// any extra units from product_uom. `label` is the UoM code (PCS, BOX, …).

export type ProductUnit = { uom_id: string; factor: number; sale_price: number; label: string };

type ProductRow = { id: string; uom_id: string; sale_price: number | string };
type ProductUomRow = { product_id: string; uom_id: string; factor: number | string; sale_price: number | string };

export function buildProductUnits(
  products: ProductRow[],
  productUoms: ProductUomRow[],
  uomCode: Map<string, string>,
): Map<string, ProductUnit[]> {
  const extra = new Map<string, ProductUnit[]>();
  for (const r of productUoms) {
    const list = extra.get(r.product_id) ?? [];
    list.push({ uom_id: r.uom_id, factor: Number(r.factor), sale_price: Number(r.sale_price), label: uomCode.get(r.uom_id) ?? "" });
    extra.set(r.product_id, list);
  }
  const out = new Map<string, ProductUnit[]>();
  for (const p of products) {
    out.set(p.id, [
      { uom_id: p.uom_id, factor: 1, sale_price: Number(p.sale_price), label: uomCode.get(p.uom_id) ?? "" },
      ...(extra.get(p.id) ?? []),
    ]);
  }
  return out;
}
