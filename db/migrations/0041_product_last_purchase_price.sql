-- =====================================================================
-- 0041 · Product last-purchase price (kept SEPARATE from master cost_price)
--
-- Buying a product on a PO never overwrites cost_price. Instead we record the
-- most recent purchase price/date here; the product UI badges when the last
-- purchase price differs from the master cost.
-- =====================================================================
alter table public.product add column if not exists last_purchase_price numeric(18,4);
alter table public.product add column if not exists last_purchase_date date;
