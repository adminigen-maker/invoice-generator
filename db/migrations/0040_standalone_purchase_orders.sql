-- =====================================================================
-- 0040 · Standalone purchase orders
--
-- Purchase orders are now plain documents with NO links to the vendor, product,
-- unit-of-measure or tax tables. The vendor is typed as free text; each line
-- carries a free-text unit and a manual tax %. The old FK columns (vendor_id,
-- warehouse_id, product_id, uom_id, tax_id) are kept but left null/unused, so
-- existing rows are untouched. Receiving a PO no longer posts stock.
-- =====================================================================
alter table public.purchase_order alter column vendor_id drop not null;
alter table public.purchase_order add column if not exists vendor_name text;

alter table public.purchase_order_line add column if not exists uom_text text;
alter table public.purchase_order_line add column if not exists tax_pct numeric(6,3) not null default 0;
