-- 0052 · Multi-UoM Phase 1: per-product extra units & pricing + line uom_factor.
--
-- The product's BASE unit stays on product.uom_id / sale_price / cost_price with
-- an implicit factor of 1. product_uom holds ADDITIONAL selling units (Box,
-- Carton, …): how many BASE units one of them equals (factor) and its own price.

create table public.product_uom (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product(id) on delete cascade,
  uom_id uuid not null references public.unit_of_measure(id),
  factor numeric(18,6) not null default 1,   -- base units per 1 of this unit (> 0)
  sale_price numeric(18,4) not null default 0,
  cost_price numeric(18,4) not null default 0,
  barcode text,
  sequence int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_uom_factor_positive check (factor > 0),
  unique (product_id, uom_id)
);
create index idx_product_uom_product_id on public.product_uom(product_id);
create index idx_product_uom_uom_id on public.product_uom(uom_id);

alter table public.product_uom enable row level security;

-- Access mirrors the parent product: managing a product's units IS editing the
-- catalogue, gated by the same inventory.product.* permissions.
create policy product_uom_read on public.product_uom for select to authenticated
  using (public.has_permission('inventory.product.view'));
create policy product_uom_insert on public.product_uom for insert to authenticated
  with check (public.has_permission('inventory.product.create') or public.has_permission('inventory.product.edit'));
create policy product_uom_update on public.product_uom for update to authenticated
  using (public.has_permission('inventory.product.edit'))
  with check (public.has_permission('inventory.product.edit'));
create policy product_uom_delete on public.product_uom for delete to authenticated
  using (public.has_permission('inventory.product.edit'));

-- Freeze the unit->base conversion factor onto every document line, exactly like
-- unit_price is frozen at transaction time. Default 1 keeps ALL existing rows and
-- flows unchanged (quantity x 1 = quantity), so this phase changes no behaviour.
alter table public.invoice_line        add column uom_factor numeric(18,6) not null default 1;
alter table public.quotation_line      add column uom_factor numeric(18,6) not null default 1;
alter table public.sales_order_line    add column uom_factor numeric(18,6) not null default 1;
alter table public.delivery_note_line  add column uom_factor numeric(18,6) not null default 1;
alter table public.purchase_order_line add column uom_factor numeric(18,6) not null default 1;
alter table public.credit_note_line    add column uom_factor numeric(18,6) not null default 1;
