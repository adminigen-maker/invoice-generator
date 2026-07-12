-- =====================================================================
-- Invoice UAE — Consolidated schema (all migrations 0001–0016)
-- One-shot install: paste into the Supabase SQL Editor and Run.
-- Generated from db/migrations/*.sql; edit those, not this file.
-- =====================================================================


-- ## SOURCE: db/migrations/0001_extensions_and_types.sql

-- =====================================================================
-- 0001 · Extensions & shared enum types
-- =====================================================================
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Document status enums.
-- Kept as text-backed enums so partial states are first-class from day 1.
do $$ begin
  create type doc_status as enum (
    'draft', 'sent', 'confirmed',
    'partially_delivered', 'delivered',
    'partially_invoiced', 'invoiced',
    'partially_paid', 'paid',
    'cancelled', 'closed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tracking_type as enum ('none', 'lot', 'serial');
exception when duplicate_object then null; end $$;

do $$ begin
  create type location_kind as enum ('stock', 'damaged', 'transit', 'customer', 'vendor', 'adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type data_scope as enum ('all', 'own', 'team', 'branch');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'bank_transfer', 'cheque', 'card', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type audit_action as enum ('insert', 'update', 'delete');
exception when duplicate_object then null; end $$;

-- Shared trigger: bumps updated_at on any row change.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ## SOURCE: db/migrations/0002_rbac.sql

-- =====================================================================
-- 0002 · Role-Based Access Control
--
-- Three independent layers, per the spec:
--   1. app_permission   — the granular capability catalog
--   2. role → many perms via role_permission
--   3. app_user → many roles via user_role (each carries its own scope)
--
-- user_permission_override lets Admin grant/revoke a single perm for a
-- single user without inventing a whole new role.
--
-- field_permission is Layer 3 (field-level): server strips these columns
-- from API responses when the user's roles lack the tagged view perm.
-- =====================================================================

-- One row per authenticated user. Mirrors auth.users (Supabase).
create table app_user (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  manager_id uuid references app_user(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger app_user_updated before update on app_user
  for each row execute function set_updated_at();

create table role (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'admin', 'sales_manager', ...
  name text not null,
  description text,
  is_system boolean not null default false,  -- system roles cannot be deleted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger role_updated before update on role
  for each row execute function set_updated_at();

create table app_permission (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'sales.quotation.create'
  module text not null,               -- 'sales', 'inventory', ...
  action text not null,               -- 'view', 'create', 'edit', 'delete', 'approve', 'void'
  description text
);
create index on app_permission (module);

create table role_permission (
  role_id uuid not null references role(id) on delete cascade,
  permission_id uuid not null references app_permission(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table user_role (
  user_id uuid not null references app_user(id) on delete cascade,
  role_id uuid not null references role(id) on delete cascade,
  scope data_scope not null default 'all',
  scope_ref uuid,                     -- branch_id / warehouse_id when scope='branch'
  primary key (user_id, role_id)
);

create table user_permission_override (
  user_id uuid not null references app_user(id) on delete cascade,
  permission_id uuid not null references app_permission(id) on delete cascade,
  granted boolean not null,           -- true = extra grant, false = revoke
  primary key (user_id, permission_id)
);

-- Layer 3: fields to hide unless the role holds `permission_code` (a view perm).
-- Enforced server-side by lib/rbac/field-filter.ts before shipping to client.
create table field_permission (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  field_name text not null,
  required_permission text not null,  -- e.g. 'sales.quotation.view_cost'
  unique (table_name, field_name)
);

-- Audit log — every meaningful mutation, especially RBAC changes.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id),
  table_name text not null,
  record_id text,
  action audit_action not null,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (table_name, record_id);
create index on audit_log (user_id, created_at desc);


-- ## SOURCE: db/migrations/0003_master_data.sql

-- =====================================================================
-- 0003 · Master data — company, tax, sequences, products, partners, warehouses
--
-- Everything downstream (sales, invoicing, inventory) depends on these.
-- =====================================================================

-- Single-row company profile. Enforced via a `singleton` boolean constraint.
create table company (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique
    check (singleton = true),
  name text not null,
  legal_name text,
  tax_registration_number text,     -- UAE TRN
  currency text not null default 'AED',
  address_line1 text,
  address_line2 text,
  city text,
  country text default 'United Arab Emirates',
  phone text,
  email text,
  website text,
  logo_url text,
  updated_at timestamptz not null default now()
);
create trigger company_updated before update on company
  for each row execute function set_updated_at();

-- Tax classes. UAE VAT 5% is seeded; add zero-rated, exempt as needed.
create table tax_rate (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'VAT_5', 'ZERO', 'EXEMPT'
  name text not null,
  rate numeric(6,3) not null,         -- percentage: 5.000
  is_inclusive boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Configurable document numbering. Format tokens: {PREFIX} {YYYY} {MM} {SEQ}.
-- SEQ is left-padded to `padding`.
create table document_sequence (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'quotation', 'sales_order', 'invoice', ...
  prefix text not null,               -- 'QUO', 'SO', 'INV'
  format text not null default '{PREFIX}-{YYYY}-{SEQ}',
  padding int not null default 5,
  next_number int not null default 1,
  reset_yearly boolean not null default true,
  last_reset_year int,
  updated_at timestamptz not null default now()
);
create trigger document_sequence_updated before update on document_sequence
  for each row execute function set_updated_at();

-- Products
create table product_category (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  parent_id uuid references product_category(id),
  created_at timestamptz not null default now()
);

create table unit_of_measure (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'PCS', 'BOX', 'KG', 'HR'
  name text not null,
  category text,                      -- 'quantity', 'weight', 'volume', 'time'
  is_active boolean not null default true
);

-- e.g. 1 BOX = 12 PCS  →  from=BOX, to=PCS, factor=12
create table uom_conversion (
  id uuid primary key default gen_random_uuid(),
  from_uom_id uuid not null references unit_of_measure(id),
  to_uom_id uuid not null references unit_of_measure(id),
  factor numeric(18,6) not null,
  unique (from_uom_id, to_uom_id)
);

create table product (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text,
  name text not null,
  description text,
  category_id uuid references product_category(id),
  uom_id uuid not null references unit_of_measure(id),
  cost_price numeric(18,4) not null default 0,
  sale_price numeric(18,4) not null default 0,
  tax_id uuid references tax_rate(id),
  tracking tracking_type not null default 'none',
  reorder_point numeric(18,4),
  is_stockable boolean not null default true,   -- false = service item
  is_active boolean not null default true,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger product_updated before update on product
  for each row execute function set_updated_at();
create index on product (name);
create index on product (category_id);

-- Customers
create table customer (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'CUST-0001'
  name text not null,
  legal_name text,
  tax_registration_number text,
  email text,
  phone text,
  credit_limit numeric(18,2) default 0,
  payment_terms_days int default 30,  -- Net 30 default
  default_tax_id uuid references tax_rate(id),
  currency text default 'AED',
  notes text,
  is_active boolean not null default true,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customer_updated before update on customer
  for each row execute function set_updated_at();
create index on customer (name);

create table customer_address (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id) on delete cascade,
  kind text not null default 'billing',   -- 'billing' | 'shipping'
  line1 text not null,
  line2 text,
  city text,
  region text,
  postal_code text,
  country text default 'United Arab Emirates',
  is_default boolean not null default false
);
create index on customer_address (customer_id);

-- Vendors (structure mirrors customer)
create table vendor (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  legal_name text,
  tax_registration_number text,
  email text,
  phone text,
  payment_terms_days int default 30,
  default_tax_id uuid references tax_rate(id),
  currency text default 'AED',
  notes text,
  is_active boolean not null default true,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vendor_updated before update on vendor
  for each row execute function set_updated_at();

-- Warehouses & internal locations
create table warehouse (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table location (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouse(id) on delete cascade,
  code text not null,
  name text not null,
  kind location_kind not null default 'stock',
  is_active boolean not null default true,
  unique (warehouse_id, code)
);


-- ## SOURCE: db/migrations/0004_sales_flow.sql

-- =====================================================================
-- 0004 · Sales flow — Quotation → Sales Order → Delivery Note
--
-- Design invariant: partial states are first-class.
--   Every child document links to specific PARENT LINES, not the header.
--   Header status is derived from line rollups, not stored as truth.
-- =====================================================================

-- ---------- Quotation ----------
create table quotation (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid not null references customer(id),
  quote_date date not null default current_date,
  valid_until date,
  currency text not null default 'AED',
  status doc_status not null default 'draft',
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  notes text,
  terms text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create trigger quotation_updated before update on quotation
  for each row execute function set_updated_at();
create index on quotation (customer_id);
create index on quotation (status);
create index on quotation (quote_date desc);

create table quotation_line (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotation(id) on delete cascade,
  sequence int not null default 0,
  product_id uuid references product(id),
  description text not null,
  quantity numeric(18,4) not null default 1,
  uom_id uuid references unit_of_measure(id),
  unit_price numeric(18,4) not null default 0,
  discount_pct numeric(6,3) not null default 0,   -- 0..100
  tax_id uuid references tax_rate(id),
  line_subtotal numeric(18,2) not null default 0,
  line_discount numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0
);
create index on quotation_line (quotation_id);

-- ---------- Sales Order ----------
create table sales_order (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  quotation_id uuid references quotation(id),
  customer_id uuid not null references customer(id),
  order_date date not null default current_date,
  currency text not null default 'AED',
  status doc_status not null default 'confirmed',
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sales_order_updated before update on sales_order
  for each row execute function set_updated_at();
create index on sales_order (customer_id);
create index on sales_order (status);

create table sales_order_line (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_order(id) on delete cascade,
  quotation_line_id uuid references quotation_line(id),
  sequence int not null default 0,
  product_id uuid references product(id),
  description text not null,
  uom_id uuid references unit_of_measure(id),
  quantity_ordered numeric(18,4) not null default 0,
  quantity_delivered numeric(18,4) not null default 0,     -- rolled up from delivery_note_line
  quantity_invoiced numeric(18,4) not null default 0,      -- rolled up from invoice_line
  unit_price numeric(18,4) not null default 0,
  discount_pct numeric(6,3) not null default 0,
  tax_id uuid references tax_rate(id),
  line_subtotal numeric(18,2) not null default 0,
  line_discount numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0
);
create index on sales_order_line (sales_order_id);

-- ---------- Delivery Note ----------
create table delivery_note (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  sales_order_id uuid not null references sales_order(id),
  warehouse_id uuid references warehouse(id),
  delivery_date date not null default current_date,
  status doc_status not null default 'draft',
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz               -- when set → stock moves have been created
);
create trigger delivery_note_updated before update on delivery_note
  for each row execute function set_updated_at();
create index on delivery_note (sales_order_id);
create index on delivery_note (status);

create table delivery_note_line (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references delivery_note(id) on delete cascade,
  sales_order_line_id uuid not null references sales_order_line(id),
  product_id uuid references product(id),
  uom_id uuid references unit_of_measure(id),
  quantity numeric(18,4) not null,
  source_location_id uuid references location(id)
);
create index on delivery_note_line (delivery_note_id);
create index on delivery_note_line (sales_order_line_id);


-- ## SOURCE: db/migrations/0005_invoicing_and_payments.sql

-- =====================================================================
-- 0005 · Invoicing & Payments
--
-- Invoice can be raised standalone OR from a sales order (any subset of
-- delivered lines). Payment is many-to-many with invoice via allocation.
-- =====================================================================

create table invoice (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  sales_order_id uuid references sales_order(id),   -- nullable = standalone invoice
  customer_id uuid not null references customer(id),
  invoice_date date not null default current_date,
  due_date date,
  currency text not null default 'AED',
  status doc_status not null default 'draft',
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  amount_paid numeric(18,2) not null default 0,     -- rolled up from payment_allocation
  balance numeric(18,2) generated always as (total - amount_paid) stored,
  notes text,
  terms text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz               -- when set → invoice is finalized, no edits
);
create trigger invoice_updated before update on invoice
  for each row execute function set_updated_at();
create index on invoice (customer_id);
create index on invoice (status);
create index on invoice (invoice_date desc);
create index on invoice (due_date);

create table invoice_line (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoice(id) on delete cascade,
  sales_order_line_id uuid references sales_order_line(id),
  delivery_note_line_id uuid references delivery_note_line(id),
  sequence int not null default 0,
  product_id uuid references product(id),
  description text not null,
  quantity numeric(18,4) not null default 1,
  uom_id uuid references unit_of_measure(id),
  unit_price numeric(18,4) not null default 0,
  discount_pct numeric(6,3) not null default 0,
  tax_id uuid references tax_rate(id),
  line_subtotal numeric(18,2) not null default 0,
  line_discount numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0
);
create index on invoice_line (invoice_id);

-- Credit notes are separate documents that reference the original invoice.
-- Kept as a table for clean reporting; posts an offsetting AR entry.
create table credit_note (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  invoice_id uuid not null references invoice(id),
  customer_id uuid not null references customer(id),
  credit_date date not null default current_date,
  reason text,
  currency text not null default 'AED',
  status doc_status not null default 'draft',
  total numeric(18,2) not null default 0,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger credit_note_updated before update on credit_note
  for each row execute function set_updated_at();

-- Payments — a single payment can be split across many invoices via allocation.
create table payment (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid not null references customer(id),
  payment_date date not null default current_date,
  method payment_method not null default 'bank_transfer',
  reference text,
  currency text not null default 'AED',
  amount numeric(18,2) not null,
  amount_unallocated numeric(18,2) not null,   -- decreases as allocations are made
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payment_updated before update on payment
  for each row execute function set_updated_at();
create index on payment (customer_id);
create index on payment (payment_date desc);

create table payment_allocation (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payment(id) on delete cascade,
  invoice_id uuid not null references invoice(id),
  amount_allocated numeric(18,2) not null check (amount_allocated > 0),
  created_at timestamptz not null default now()
);
create index on payment_allocation (payment_id);
create index on payment_allocation (invoice_id);

-- ---------- Rollup triggers ----------
-- Keep sales_order_line.quantity_delivered / quantity_invoiced accurate
-- so the parent status can be derived.

create or replace function rollup_delivered_qty(so_line_id uuid) returns void as $$
begin
  update sales_order_line
     set quantity_delivered = coalesce((
         select sum(quantity) from delivery_note_line
         where sales_order_line_id = so_line_id
     ), 0)
   where id = so_line_id;
end;
$$ language plpgsql;

create or replace function trg_delivery_note_line_rollup() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform rollup_delivered_qty(old.sales_order_line_id);
    return old;
  else
    perform rollup_delivered_qty(new.sales_order_line_id);
    if tg_op = 'UPDATE' and old.sales_order_line_id <> new.sales_order_line_id then
      perform rollup_delivered_qty(old.sales_order_line_id);
    end if;
    return new;
  end if;
end;
$$ language plpgsql;

create trigger delivery_note_line_rollup
  after insert or update or delete on delivery_note_line
  for each row execute function trg_delivery_note_line_rollup();

create or replace function rollup_invoiced_qty(so_line_id uuid) returns void as $$
begin
  update sales_order_line
     set quantity_invoiced = coalesce((
         select sum(quantity) from invoice_line
         where sales_order_line_id = so_line_id
     ), 0)
   where id = so_line_id;
end;
$$ language plpgsql;

create or replace function trg_invoice_line_rollup() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.sales_order_line_id is not null then
      perform rollup_invoiced_qty(old.sales_order_line_id);
    end if;
    return old;
  else
    if new.sales_order_line_id is not null then
      perform rollup_invoiced_qty(new.sales_order_line_id);
    end if;
    if tg_op = 'UPDATE'
       and coalesce(old.sales_order_line_id::text,'') <> coalesce(new.sales_order_line_id::text,'')
       and old.sales_order_line_id is not null then
      perform rollup_invoiced_qty(old.sales_order_line_id);
    end if;
    return new;
  end if;
end;
$$ language plpgsql;

create trigger invoice_line_rollup
  after insert or update or delete on invoice_line
  for each row execute function trg_invoice_line_rollup();

-- Rollup payment allocations back onto the invoice.
create or replace function rollup_invoice_paid(inv_id uuid) returns void as $$
begin
  update invoice
     set amount_paid = coalesce((
         select sum(amount_allocated) from payment_allocation
         where invoice_id = inv_id
     ), 0)
   where id = inv_id;
end;
$$ language plpgsql;

create or replace function rollup_payment_unallocated(pay_id uuid) returns void as $$
begin
  update payment p
     set amount_unallocated = p.amount - coalesce((
         select sum(amount_allocated) from payment_allocation
         where payment_id = pay_id
     ), 0)
   where p.id = pay_id;
end;
$$ language plpgsql;

create or replace function trg_payment_allocation_rollup() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform rollup_invoice_paid(old.invoice_id);
    perform rollup_payment_unallocated(old.payment_id);
    return old;
  else
    perform rollup_invoice_paid(new.invoice_id);
    perform rollup_payment_unallocated(new.payment_id);
    if tg_op = 'UPDATE' and old.invoice_id <> new.invoice_id then
      perform rollup_invoice_paid(old.invoice_id);
    end if;
    return new;
  end if;
end;
$$ language plpgsql;

create trigger payment_allocation_rollup
  after insert or update or delete on payment_allocation
  for each row execute function trg_payment_allocation_rollup();


-- ## SOURCE: db/migrations/0006_inventory.sql

-- =====================================================================
-- 0006 · Inventory — append-only stock moves + on-hand view
--
-- stock_move rows are NEVER updated or deleted. Corrections are
-- new offsetting rows. This makes audit trivial and lets you ask
-- "what did on-hand look like on 2026-07-03?" without lying.
-- =====================================================================

create table stock_move (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references product(id),
  uom_id uuid references unit_of_measure(id),
  quantity numeric(18,4) not null,           -- positive; direction is implied by source/dest
  source_location_id uuid references location(id),
  dest_location_id uuid references location(id),
  reference_type text,                        -- 'delivery_note', 'goods_receipt', 'adjustment'
  reference_id uuid,
  unit_cost numeric(18,4),                    -- captured at move time for valuation
  move_date timestamptz not null default now(),
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now()
);
create index on stock_move (product_id, move_date);
create index on stock_move (source_location_id);
create index on stock_move (dest_location_id);
create index on stock_move (reference_type, reference_id);

-- Guardrail: at least one of source/dest must be set, and they must differ.
alter table stock_move add constraint stock_move_endpoints
  check (
    (source_location_id is not null or dest_location_id is not null)
    and coalesce(source_location_id::text,'') <> coalesce(dest_location_id::text,'')
  );

-- Guardrail: append-only.
create or replace function stock_move_immutable() returns trigger as $$
begin
  raise exception 'stock_move is append-only — insert an offsetting row instead';
end;
$$ language plpgsql;
create trigger stock_move_no_update before update on stock_move
  for each row execute function stock_move_immutable();
create trigger stock_move_no_delete before delete on stock_move
  for each row execute function stock_move_immutable();

-- On-hand view: sum of (dest) minus (source) for each (product, location).
create or replace view stock_on_hand as
  select
    p.id           as product_id,
    l.id           as location_id,
    coalesce(sum(case when sm.dest_location_id   = l.id then  sm.quantity end), 0)
    - coalesce(sum(case when sm.source_location_id = l.id then  sm.quantity end), 0)
      as quantity_on_hand
  from product p
  cross join location l
  left join stock_move sm
    on sm.product_id = p.id
   and (sm.source_location_id = l.id or sm.dest_location_id = l.id)
  group by p.id, l.id;

-- ---------- Post-delivery hook ----------
-- When a delivery note's posted_at flips from NULL → set, emit stock moves
-- for every line: source = warehouse location, dest = customer virtual loc.
create or replace function post_delivery_note_moves() returns trigger as $$
declare
  ln record;
  customer_loc uuid;
  ship_from uuid;
begin
  if new.posted_at is null or old.posted_at is not null then
    return new;
  end if;

  select id into customer_loc from location where kind = 'customer' limit 1;
  if customer_loc is null then
    raise exception 'No virtual customer location configured — seed one before posting deliveries';
  end if;

  for ln in
    select dnl.*, so_l.description
      from delivery_note_line dnl
      join sales_order_line so_l on so_l.id = dnl.sales_order_line_id
     where dnl.delivery_note_id = new.id
  loop
    ship_from := coalesce(
      ln.source_location_id,
      (select id from location where warehouse_id = new.warehouse_id and kind = 'stock' limit 1)
    );
    if ship_from is null then
      raise exception 'No source stock location resolved for delivery %', new.number;
    end if;

    insert into stock_move
      (product_id, uom_id, quantity, source_location_id, dest_location_id,
       reference_type, reference_id, move_date, created_by, notes)
    values
      (ln.product_id, ln.uom_id, ln.quantity, ship_from, customer_loc,
       'delivery_note', new.id, now(), new.created_by, 'Auto: delivery ' || new.number);
  end loop;

  return new;
end;
$$ language plpgsql;

create trigger delivery_note_post_moves
  after update on delivery_note
  for each row execute function post_delivery_note_moves();


-- ## SOURCE: db/migrations/0007_rls_policies.sql

-- =====================================================================
-- 0007 · Row-Level Security policies
--
-- Layer 2 of RBAC (data scope) lives here in the DB.
-- Layer 1 (module/action perms) is enforced in server actions via can().
-- Layer 3 (field-level) is enforced by the field-filter middleware.
--
-- Strategy: RLS is a defense-in-depth SAFETY NET, not the primary check.
-- The app calls can() before every mutation; RLS just refuses to leak
-- rows even if the app forgets.
-- =====================================================================

-- Helper: does the current user hold this permission?
-- Union of role_permission and positive user_permission_override,
-- minus negative overrides.
create or replace function has_permission(perm_code text) returns boolean as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;

  -- Negative override wins.
  if exists (
    select 1 from user_permission_override upo
    join app_permission p on p.id = upo.permission_id
    where upo.user_id = uid and p.code = perm_code and upo.granted = false
  ) then
    return false;
  end if;

  -- Positive override or role-based grant.
  return exists (
    select 1 from user_permission_override upo
    join app_permission p on p.id = upo.permission_id
    where upo.user_id = uid and p.code = perm_code and upo.granted = true
  ) or exists (
    select 1
      from user_role ur
      join role_permission rp on rp.role_id = ur.role_id
      join app_permission p on p.id = rp.permission_id
     where ur.user_id = uid and p.code = perm_code
  );
end;
$$ language plpgsql stable security definer;

-- Max data scope the current user has for a given module.
-- Ordering: all > team > branch > own.
create or replace function user_scope(module_code text) returns data_scope as $$
declare
  uid uuid := auth.uid();
  best data_scope;
begin
  if uid is null then return 'own'::data_scope; end if;

  select ur.scope
    into best
    from user_role ur
    join role_permission rp on rp.role_id = ur.role_id
    join app_permission p on p.id = rp.permission_id
   where ur.user_id = uid
     and p.module = module_code
   order by case ur.scope
     when 'all' then 1
     when 'team' then 2
     when 'branch' then 3
     when 'own' then 4
   end
   limit 1;

  return coalesce(best, 'own'::data_scope);
end;
$$ language plpgsql stable security definer;

-- Is target_user in the current user's reporting tree (any depth)?
create or replace function is_team_member(target uuid) returns boolean as $$
  with recursive tree as (
    select id, manager_id from app_user where manager_id = auth.uid()
    union all
    select u.id, u.manager_id
      from app_user u
      join tree t on u.manager_id = t.id
  )
  select exists (select 1 from tree where id = target)
     or target = auth.uid();
$$ language sql stable security definer;

-- Convenience: matches a row's created_by against the current user + scope.
create or replace function scope_allows(created_by_col uuid, module_code text)
returns boolean as $$
declare
  s data_scope := user_scope(module_code);
begin
  if s = 'all' then return true; end if;
  if s = 'own' then return created_by_col = auth.uid(); end if;
  if s = 'team' then return is_team_member(created_by_col); end if;
  -- 'branch' scope is context-specific; enforced in per-table policies.
  return false;
end;
$$ language plpgsql stable security definer;

-- ---------- Enable RLS on all user-facing tables ----------
alter table app_user                    enable row level security;
alter table role                        enable row level security;
alter table app_permission              enable row level security;
alter table role_permission             enable row level security;
alter table user_role                   enable row level security;
alter table user_permission_override    enable row level security;
alter table field_permission            enable row level security;
alter table audit_log                   enable row level security;

alter table company                     enable row level security;
alter table tax_rate                    enable row level security;
alter table document_sequence           enable row level security;
alter table product_category            enable row level security;
alter table unit_of_measure             enable row level security;
alter table uom_conversion              enable row level security;
alter table product                     enable row level security;
alter table customer                    enable row level security;
alter table customer_address            enable row level security;
alter table vendor                      enable row level security;
alter table warehouse                   enable row level security;
alter table location                    enable row level security;

alter table quotation                   enable row level security;
alter table quotation_line              enable row level security;
alter table sales_order                 enable row level security;
alter table sales_order_line            enable row level security;
alter table delivery_note               enable row level security;
alter table delivery_note_line          enable row level security;

alter table invoice                     enable row level security;
alter table invoice_line                enable row level security;
alter table credit_note                 enable row level security;
alter table payment                     enable row level security;
alter table payment_allocation          enable row level security;

alter table stock_move                  enable row level security;

-- ---------- Baseline policies ----------
-- Every authenticated user can read reference tables (master data catalogs).
create policy read_all_authed on tax_rate            for select to authenticated using (true);
create policy read_all_authed on document_sequence   for select to authenticated using (true);
create policy read_all_authed on product_category    for select to authenticated using (true);
create policy read_all_authed on unit_of_measure     for select to authenticated using (true);
create policy read_all_authed on uom_conversion      for select to authenticated using (true);
create policy read_all_authed on warehouse           for select to authenticated using (true);
create policy read_all_authed on location            for select to authenticated using (true);
create policy read_all_authed on company             for select to authenticated using (true);
create policy read_all_authed on app_permission      for select to authenticated using (true);
create policy read_all_authed on role                for select to authenticated using (true);
-- The app must read role_permission and its own overrides to compute effective perms.
create policy read_all_authed on role_permission     for select to authenticated using (true);
create policy read_own_overrides on user_permission_override for select to authenticated using (user_id = auth.uid());
create policy read_all_authed on field_permission    for select to authenticated using (true);

-- Users can read themselves; admins can read all.
create policy read_self on app_user for select to authenticated
  using (id = auth.uid() or has_permission('admin.users.view'));
create policy admin_write on app_user for all to authenticated
  using (has_permission('admin.users.edit'))
  with check (has_permission('admin.users.edit'));

-- Product master
create policy product_read on product for select to authenticated
  using (has_permission('inventory.product.view'));
create policy product_write on product for insert to authenticated
  with check (has_permission('inventory.product.create'));
create policy product_update on product for update to authenticated
  using (has_permission('inventory.product.edit'))
  with check (has_permission('inventory.product.edit'));
create policy product_delete on product for delete to authenticated
  using (has_permission('inventory.product.delete'));

-- Customer master
create policy customer_read on customer for select to authenticated
  using (has_permission('sales.customer.view')
         and scope_allows(created_by, 'sales'));
create policy customer_insert on customer for insert to authenticated
  with check (has_permission('sales.customer.create'));
create policy customer_update on customer for update to authenticated
  using (has_permission('sales.customer.edit') and scope_allows(created_by, 'sales'))
  with check (has_permission('sales.customer.edit'));

create policy customer_address_all on customer_address for all to authenticated
  using (exists (
    select 1 from customer c where c.id = customer_id
      and has_permission('sales.customer.view')
      and scope_allows(c.created_by, 'sales')))
  with check (has_permission('sales.customer.edit'));

-- Sales flow: Quotation → Sales Order → Delivery Note
create policy quotation_read on quotation for select to authenticated
  using (has_permission('sales.quotation.view') and scope_allows(created_by, 'sales'));
create policy quotation_insert on quotation for insert to authenticated
  with check (has_permission('sales.quotation.create'));
create policy quotation_update on quotation for update to authenticated
  using (has_permission('sales.quotation.edit') and scope_allows(created_by, 'sales'))
  with check (has_permission('sales.quotation.edit'));
create policy quotation_delete on quotation for delete to authenticated
  using (has_permission('sales.quotation.delete') and scope_allows(created_by, 'sales'));

create policy quotation_line_all on quotation_line for all to authenticated
  using (exists (select 1 from quotation q where q.id = quotation_id
                   and has_permission('sales.quotation.view')
                   and scope_allows(q.created_by, 'sales')))
  with check (exists (select 1 from quotation q where q.id = quotation_id
                        and has_permission('sales.quotation.edit')));

create policy sales_order_read on sales_order for select to authenticated
  using (has_permission('sales.order.view') and scope_allows(created_by, 'sales'));
create policy sales_order_insert on sales_order for insert to authenticated
  with check (has_permission('sales.order.create'));
create policy sales_order_update on sales_order for update to authenticated
  using (has_permission('sales.order.edit') and scope_allows(created_by, 'sales'))
  with check (has_permission('sales.order.edit'));

create policy sales_order_line_all on sales_order_line for all to authenticated
  using (exists (select 1 from sales_order so where so.id = sales_order_id
                   and has_permission('sales.order.view')
                   and scope_allows(so.created_by, 'sales')))
  with check (exists (select 1 from sales_order so where so.id = sales_order_id
                        and has_permission('sales.order.edit')));

create policy delivery_read on delivery_note for select to authenticated
  using (has_permission('inventory.delivery.view'));
create policy delivery_insert on delivery_note for insert to authenticated
  with check (has_permission('inventory.delivery.create'));
create policy delivery_update on delivery_note for update to authenticated
  using (has_permission('inventory.delivery.edit'))
  with check (has_permission('inventory.delivery.edit'));

create policy delivery_line_all on delivery_note_line for all to authenticated
  using (exists (select 1 from delivery_note d where d.id = delivery_note_id
                   and has_permission('inventory.delivery.view')))
  with check (exists (select 1 from delivery_note d where d.id = delivery_note_id
                        and has_permission('inventory.delivery.edit')));

-- Invoicing
create policy invoice_read on invoice for select to authenticated
  using (has_permission('invoice.view') and scope_allows(created_by, 'invoice'));
create policy invoice_insert on invoice for insert to authenticated
  with check (has_permission('invoice.create'));
create policy invoice_update on invoice for update to authenticated
  using (has_permission('invoice.edit') and scope_allows(created_by, 'invoice'))
  with check (has_permission('invoice.edit'));
create policy invoice_delete on invoice for delete to authenticated
  using (has_permission('invoice.void') and scope_allows(created_by, 'invoice'));

create policy invoice_line_all on invoice_line for all to authenticated
  using (exists (select 1 from invoice i where i.id = invoice_id
                   and has_permission('invoice.view')
                   and scope_allows(i.created_by, 'invoice')))
  with check (exists (select 1 from invoice i where i.id = invoice_id
                        and has_permission('invoice.edit')));

create policy credit_note_all on credit_note for all to authenticated
  using (has_permission('invoice.credit_note.view'))
  with check (has_permission('invoice.credit_note.create'));

create policy payment_read on payment for select to authenticated
  using (has_permission('invoice.payment.view'));
create policy payment_insert on payment for insert to authenticated
  with check (has_permission('invoice.payment.create'));
create policy payment_update on payment for update to authenticated
  using (has_permission('invoice.payment.edit'))
  with check (has_permission('invoice.payment.edit'));

create policy payment_alloc_all on payment_allocation for all to authenticated
  using (has_permission('invoice.payment.view'))
  with check (has_permission('invoice.payment.create'));

-- Inventory
create policy stock_move_read on stock_move for select to authenticated
  using (has_permission('inventory.stock.view'));
create policy stock_move_insert on stock_move for insert to authenticated
  with check (has_permission('inventory.stock.adjust')
              or has_permission('inventory.delivery.create')
              or has_permission('inventory.receipt.create'));

-- Audit log — write-only for the app (via triggers); admins read.
create policy audit_read on audit_log for select to authenticated
  using (has_permission('admin.audit.view'));
create policy audit_insert on audit_log for insert to authenticated
  with check (true);

-- RBAC catalog editing — admin only.
create policy admin_write_roles on role for all to authenticated
  using (has_permission('admin.roles.edit'))
  with check (has_permission('admin.roles.edit'));

create policy admin_write_role_perm on role_permission for all to authenticated
  using (has_permission('admin.roles.edit'))
  with check (has_permission('admin.roles.edit'));

create policy admin_read_user_roles on user_role for select to authenticated
  using (user_id = auth.uid() or has_permission('admin.users.view'));
create policy admin_write_user_roles on user_role for insert to authenticated
  with check (has_permission('admin.users.edit'));
create policy admin_del_user_roles on user_role for delete to authenticated
  using (has_permission('admin.users.edit'));

create policy admin_write_overrides on user_permission_override for all to authenticated
  using (has_permission('admin.users.edit'))
  with check (has_permission('admin.users.edit'));

create policy admin_field_perm on field_permission for all to authenticated
  using (has_permission('admin.roles.edit'))
  with check (has_permission('admin.roles.edit'));


-- ## SOURCE: db/migrations/0008_seed_rbac_and_defaults.sql

-- =====================================================================
-- 0008 · Seed data — default roles, permissions, tax, UoM, sequences
-- =====================================================================

-- ---------- Permissions catalog ----------
insert into app_permission (code, module, action, description) values
  -- Admin
  ('admin.users.view',                'admin', 'view',   'View users'),
  ('admin.users.edit',                'admin', 'edit',   'Create/edit users, assign roles'),
  ('admin.roles.view',                'admin', 'view',   'View roles & permissions'),
  ('admin.roles.edit',                'admin', 'edit',   'Edit roles & permissions'),
  ('admin.audit.view',                'admin', 'view',   'View audit log'),
  ('admin.company.edit',              'admin', 'edit',   'Edit company profile & branding'),
  ('admin.sequence.edit',             'admin', 'edit',   'Edit document numbering sequences'),
  ('admin.tax.edit',                  'admin', 'edit',   'Edit tax configuration'),

  -- Sales
  ('sales.customer.view',             'sales', 'view',   'View customers'),
  ('sales.customer.create',           'sales', 'create', 'Create customers'),
  ('sales.customer.edit',             'sales', 'edit',   'Edit customers'),
  ('sales.customer.delete',           'sales', 'delete', 'Delete customers'),

  ('sales.quotation.view',            'sales', 'view',   'View quotations'),
  ('sales.quotation.view_cost',       'sales', 'view',   'View cost price / margin on quotations'),
  ('sales.quotation.create',          'sales', 'create', 'Create quotations'),
  ('sales.quotation.edit',            'sales', 'edit',   'Edit quotations'),
  ('sales.quotation.delete',          'sales', 'delete', 'Delete quotations'),
  ('sales.quotation.confirm',         'sales', 'approve','Confirm quotation to Sales Order'),

  ('sales.order.view',                'sales', 'view',   'View sales orders'),
  ('sales.order.create',              'sales', 'create', 'Create sales orders directly'),
  ('sales.order.edit',                'sales', 'edit',   'Edit sales orders'),
  ('sales.order.cancel',              'sales', 'approve','Cancel sales orders'),

  -- Inventory / Delivery
  ('inventory.product.view',          'inventory', 'view',   'View products'),
  ('inventory.product.create',        'inventory', 'create', 'Create products'),
  ('inventory.product.edit',          'inventory', 'edit',   'Edit products'),
  ('inventory.product.delete',        'inventory', 'delete', 'Delete products'),
  ('inventory.product.view_cost',     'inventory', 'view',   'View cost price on products'),

  ('inventory.stock.view',            'inventory', 'view',   'View stock levels & moves'),
  ('inventory.stock.adjust',          'inventory', 'edit',   'Adjust stock manually'),

  ('inventory.delivery.view',         'inventory', 'view',   'View delivery notes'),
  ('inventory.delivery.create',       'inventory', 'create', 'Create delivery notes'),
  ('inventory.delivery.edit',         'inventory', 'edit',   'Edit delivery notes'),
  ('inventory.delivery.post',         'inventory', 'approve','Post delivery note (deducts stock)'),

  ('inventory.receipt.create',        'inventory', 'create', 'Create goods receipts'),

  -- Invoicing
  ('invoice.view',                    'invoice',   'view',   'View invoices'),
  ('invoice.create',                  'invoice',   'create', 'Create invoices'),
  ('invoice.edit',                    'invoice',   'edit',   'Edit draft invoices'),
  ('invoice.post',                    'invoice',   'approve','Post invoice (finalize, no edits)'),
  ('invoice.void',                    'invoice',   'delete', 'Void posted invoice'),
  ('invoice.credit_note.view',        'invoice',   'view',   'View credit notes'),
  ('invoice.credit_note.create',      'invoice',   'create', 'Issue credit notes'),

  ('invoice.payment.view',            'invoice',   'view',   'View payments'),
  ('invoice.payment.create',          'invoice',   'create', 'Record payments'),
  ('invoice.payment.edit',            'invoice',   'edit',   'Edit payments')
on conflict (code) do nothing;

-- ---------- Default roles ----------
insert into role (code, name, description, is_system) values
  ('admin',          'Administrator',   'Full access to everything, including RBAC configuration', true),
  ('sales_manager',  'Sales Manager',   'Full Sales module, view Inventory, financial reports for their team', true),
  ('sales_person',   'Sales Person',    'Create quotations/orders for own customers; no cost price visible', true),
  ('warehouse_staff','Warehouse Staff', 'Delivery notes, goods receipt, stock moves; no pricing', true),
  ('accountant',     'Accountant',      'Invoicing, payments, credit notes, financial reports', true),
  ('viewer',         'Viewer',          'Read-only across all documents', true)
on conflict (code) do nothing;

-- ---------- Grant permissions to each default role ----------
-- Admin: everything.
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r cross join app_permission p
   where r.code = 'admin'
on conflict do nothing;

-- Sales Manager
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'sales_manager'
     and (p.module = 'sales'
       or p.code in (
         'inventory.product.view', 'inventory.product.view_cost',
         'inventory.stock.view', 'inventory.delivery.view',
         'invoice.view', 'invoice.payment.view'))
on conflict do nothing;

-- Sales Person — NO view_cost
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'sales_person'
     and p.code in (
       'sales.customer.view', 'sales.customer.create', 'sales.customer.edit',
       'sales.quotation.view', 'sales.quotation.create', 'sales.quotation.edit',
       'sales.order.view', 'sales.order.create', 'sales.order.edit',
       'inventory.product.view',
       'invoice.view')
on conflict do nothing;

-- Warehouse Staff
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'warehouse_staff'
     and p.code in (
       'inventory.product.view',
       'inventory.stock.view', 'inventory.stock.adjust',
       'inventory.delivery.view', 'inventory.delivery.create',
       'inventory.delivery.edit', 'inventory.delivery.post',
       'inventory.receipt.create',
       'sales.order.view')
on conflict do nothing;

-- Accountant
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'accountant'
     and (p.module = 'invoice'
       or p.code in (
         'sales.customer.view', 'sales.order.view',
         'inventory.product.view', 'inventory.product.view_cost',
         'inventory.stock.view'))
on conflict do nothing;

-- Viewer: only *.view permissions.
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'viewer' and p.action = 'view'
on conflict do nothing;

-- ---------- Field-level protection ----------
-- cost_price and margin are hidden unless the role holds the view_cost perm.
insert into field_permission (table_name, field_name, required_permission) values
  ('product',            'cost_price',        'inventory.product.view_cost'),
  ('quotation_line',     'cost_at_quote',     'sales.quotation.view_cost'),
  ('sales_order_line',   'cost_at_order',     'sales.quotation.view_cost'),
  ('invoice_line',       'margin',            'sales.quotation.view_cost')
on conflict do nothing;

-- ---------- Currencies / tax ----------
insert into tax_rate (code, name, rate, is_inclusive, is_active) values
  ('VAT_5',   'UAE VAT 5%',           5.000, false, true),
  ('VAT_0',   'Zero-rated',            0.000, false, true),
  ('EXEMPT',  'Exempt',                0.000, false, true)
on conflict (code) do nothing;

-- ---------- Units of measure ----------
insert into unit_of_measure (code, name, category) values
  ('PCS',  'Piece',      'quantity'),
  ('BOX',  'Box',        'quantity'),
  ('KG',   'Kilogram',   'weight'),
  ('G',    'Gram',       'weight'),
  ('L',    'Litre',      'volume'),
  ('ML',   'Millilitre', 'volume'),
  ('HR',   'Hour',       'time'),
  ('DAY',  'Day',        'time'),
  ('SVC',  'Service',    'quantity')
on conflict (code) do nothing;

-- ---------- Document numbering ----------
insert into document_sequence (code, prefix, format, padding, next_number) values
  ('quotation',      'QUO', '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('sales_order',    'SO',  '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('delivery_note',  'DN',  '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('invoice',        'INV', '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('credit_note',    'CN',  '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('payment',        'PAY', '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('customer',       'CUST','{PREFIX}-{SEQ}',        5, 1),
  ('vendor',         'VEND','{PREFIX}-{SEQ}',        5, 1)
on conflict (code) do nothing;

-- ---------- Company placeholder ----------
insert into company (name, legal_name, currency, country)
  values ('Your Company LLC', 'Your Company LLC', 'AED', 'United Arab Emirates')
on conflict do nothing;

-- ---------- Default warehouse + internal locations ----------
insert into warehouse (code, name) values ('WH-MAIN', 'Main Warehouse')
on conflict (code) do nothing;

insert into location (warehouse_id, code, name, kind)
  select w.id, x.code, x.name, x.kind::location_kind
    from warehouse w,
         (values
           ('MAIN',    'Main Stock',      'stock'),
           ('DAMAGED', 'Damaged Goods',   'damaged'),
           ('TRANSIT', 'In Transit',      'transit'),
           ('CUST',    'Customer (virt)', 'customer'),
           ('VEND',    'Vendor (virt)',   'vendor'),
           ('ADJ',     'Adjustment',      'adjustment')
         ) x(code, name, kind)
   where w.code = 'WH-MAIN'
on conflict (warehouse_id, code) do nothing;

-- ---------- Sequence-issuing function ----------
-- Atomic: bumps next_number, applies format, resets yearly if configured.
create or replace function next_document_number(seq_code text) returns text as $$
declare
  s document_sequence%rowtype;
  yr int := extract(year from current_date)::int;
  n int;
  fmt text;
begin
  update document_sequence
     set next_number = case
           when reset_yearly and (last_reset_year is null or last_reset_year < yr) then 2
           else next_number + 1
         end,
         last_reset_year = case
           when reset_yearly and (last_reset_year is null or last_reset_year < yr) then yr
           else last_reset_year
         end
   where code = seq_code
   returning * into s;

  if not found then
    raise exception 'Unknown sequence: %', seq_code;
  end if;

  n := case
    when s.reset_yearly and s.last_reset_year = yr and s.next_number = 2 then 1
    else s.next_number - 1
  end;

  fmt := s.format;
  fmt := replace(fmt, '{PREFIX}', s.prefix);
  fmt := replace(fmt, '{YYYY}',   yr::text);
  fmt := replace(fmt, '{MM}',     lpad(extract(month from current_date)::text, 2, '0'));
  fmt := replace(fmt, '{SEQ}',    lpad(n::text, s.padding, '0'));
  return fmt;
end;
$$ language plpgsql;


-- ## SOURCE: db/migrations/0009_security_hardening.sql

-- =====================================================================
-- 0009 · Security hardening (addresses Supabase advisor findings)
--
--  1. stock_on_hand view → security_invoker (was SECURITY DEFINER, which
--     bypassed the querying user's RLS on stock_move/product/location).
--  2. Pin search_path on every function (defends SECURITY DEFINER helpers
--     against search_path injection; silences the linter on the rest).
--  3. RBAC helper functions: remove the blanket PUBLIC execute grant so
--     the `anon` role can't probe them over /rest/v1/rpc, while keeping
--     `authenticated` (RLS policies invoke them).
--  4. Tighten audit_log INSERT so only a real session can append.
-- =====================================================================

-- 1. View respects the caller's RLS instead of the creator's.
alter view public.stock_on_hand set (security_invoker = on);

-- 2a. SECURITY DEFINER RBAC helpers: recreate with an empty search_path and
--     fully-qualified identifiers so nothing resolves through a caller-
--     controlled schema.
create or replace function public.has_permission(perm_code text) returns boolean as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;

  -- Negative override wins.
  if exists (
    select 1 from public.user_permission_override upo
    join public.app_permission p on p.id = upo.permission_id
    where upo.user_id = uid and p.code = perm_code and upo.granted = false
  ) then
    return false;
  end if;

  return exists (
    select 1 from public.user_permission_override upo
    join public.app_permission p on p.id = upo.permission_id
    where upo.user_id = uid and p.code = perm_code and upo.granted = true
  ) or exists (
    select 1
      from public.user_role ur
      join public.role_permission rp on rp.role_id = ur.role_id
      join public.app_permission p on p.id = rp.permission_id
     where ur.user_id = uid and p.code = perm_code
  );
end;
$$ language plpgsql stable security definer set search_path = '';

create or replace function public.user_scope(module_code text) returns public.data_scope as $$
declare
  uid uuid := auth.uid();
  best public.data_scope;
begin
  if uid is null then return 'own'::public.data_scope; end if;

  select ur.scope
    into best
    from public.user_role ur
    join public.role_permission rp on rp.role_id = ur.role_id
    join public.app_permission p on p.id = rp.permission_id
   where ur.user_id = uid
     and p.module = module_code
   order by case ur.scope
     when 'all' then 1
     when 'team' then 2
     when 'branch' then 3
     when 'own' then 4
   end
   limit 1;

  return coalesce(best, 'own'::public.data_scope);
end;
$$ language plpgsql stable security definer set search_path = '';

create or replace function public.is_team_member(target uuid) returns boolean as $$
  with recursive tree as (
    select id, manager_id from public.app_user where manager_id = auth.uid()
    union all
    select u.id, u.manager_id
      from public.app_user u
      join tree t on u.manager_id = t.id
  )
  select exists (select 1 from tree where id = target)
     or target = auth.uid();
$$ language sql stable security definer set search_path = '';

create or replace function public.scope_allows(created_by_col uuid, module_code text)
returns boolean as $$
declare
  s public.data_scope := public.user_scope(module_code);
begin
  if s = 'all' then return true; end if;
  if s = 'own' then return created_by_col = auth.uid(); end if;
  if s = 'team' then return public.is_team_member(created_by_col); end if;
  return false;
end;
$$ language plpgsql stable security definer set search_path = '';

-- 2b. Remaining functions (SECURITY INVOKER triggers/utilities): pin the
--     path without rewriting their bodies. public stays resolvable.
alter function public.set_updated_at()                    set search_path = public, pg_temp;
alter function public.next_document_number(text)          set search_path = public, pg_temp;
alter function public.rollup_delivered_qty(uuid)          set search_path = public, pg_temp;
alter function public.trg_delivery_note_line_rollup()     set search_path = public, pg_temp;
alter function public.rollup_invoiced_qty(uuid)           set search_path = public, pg_temp;
alter function public.trg_invoice_line_rollup()           set search_path = public, pg_temp;
alter function public.rollup_invoice_paid(uuid)           set search_path = public, pg_temp;
alter function public.rollup_payment_unallocated(uuid)    set search_path = public, pg_temp;
alter function public.trg_payment_allocation_rollup()     set search_path = public, pg_temp;
alter function public.stock_move_immutable()              set search_path = public, pg_temp;
alter function public.post_delivery_note_moves()          set search_path = public, pg_temp;

-- 3. RBAC helpers: keep EXECUTE only for `authenticated` (RLS policies invoke
--    them). Supabase's default privileges grant EXECUTE directly to both
--    `anon` and `authenticated`, so revoke `anon` explicitly (revoking PUBLIC
--    alone does not remove the direct per-role grant).
revoke execute on function public.has_permission(text)          from public, anon;
revoke execute on function public.user_scope(text)              from public, anon;
revoke execute on function public.is_team_member(uuid)          from public, anon;
revoke execute on function public.scope_allows(uuid, text)      from public, anon;
grant  execute on function public.has_permission(text)          to authenticated;
grant  execute on function public.user_scope(text)              to authenticated;
grant  execute on function public.is_team_member(uuid)          to authenticated;
grant  execute on function public.scope_allows(uuid, text)      to authenticated;

-- NOTE: the 4 helpers remain callable by `authenticated` via /rest/v1/rpc,
-- which Supabase's advisor flags as WARN. This is accepted by design:
--   * RLS policies on every table invoke them, so `authenticated` MUST hold
--     EXECUTE — revoking it would break row-level security entirely.
--   * They only ever reveal the CALLER'S OWN authorization state
--     (has_permission → own boolean, user_scope → own scope,
--      is_team_member/scope_allows → own reporting tree). No cross-user data.
-- To silence the WARN entirely, move these four into a non-exposed schema
-- (e.g. `private`) and update the policy references — deferred as it touches
-- all 57 policies and needs live-session RLS testing.

-- 4. audit_log: require an authenticated session to append (was WITH CHECK true).
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (auth.uid() is not null);


-- ## SOURCE: db/migrations/0010_perf_rpcs.sql

-- =====================================================================
-- 0010 · Performance RPCs
--
-- Collapse multi-round-trip read patterns into a single DB call. Round
-- trips are ~free inside the DB region but expensive from the app; these
-- turn "N sequential Supabase hops" into one.
-- =====================================================================

-- Effective permission codes for the current user, resolved server-side in
-- ONE call (role grants ∪ positive overrides, minus negative overrides).
-- Replaces the 3-query chain in lib/rbac/can.ts. Only ever returns the
-- CALLER'S OWN codes (auth.uid()), so security definer is safe here.
create or replace function public.my_permission_codes()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct code), '{}'::text[])
  from (
    select p.code
      from public.user_role ur
      join public.role_permission rp on rp.role_id = ur.role_id
      join public.app_permission p on p.id = rp.permission_id
     where ur.user_id = auth.uid()
    union
    select p.code
      from public.user_permission_override upo
      join public.app_permission p on p.id = upo.permission_id
     where upo.user_id = auth.uid() and upo.granted = true
  ) granted
  where code not in (
    select p.code
      from public.user_permission_override upo
      join public.app_permission p on p.id = upo.permission_id
     where upo.user_id = auth.uid() and upo.granted = false
  );
$$;

revoke execute on function public.my_permission_codes() from public, anon;
grant  execute on function public.my_permission_codes() to authenticated;

-- Dashboard money aggregates in one scalar round trip instead of streaming
-- every invoice row to the app and summing in JS. SECURITY INVOKER so the
-- caller's RLS on `invoice` still applies (each user only sums what they can see).
create or replace function public.dashboard_totals()
returns table (revenue numeric, outstanding numeric)
language sql stable security invoker set search_path = ''
as $$
  select
    coalesce(sum(i.total), 0)::numeric   as revenue,
    coalesce(sum(i.balance), 0)::numeric as outstanding
  from public.invoice i;
$$;

grant execute on function public.dashboard_totals() to authenticated;


-- ## SOURCE: db/migrations/0011_dashboard_charts.sql

-- =====================================================================
-- 0011 · Dashboard chart aggregates
--
-- Small, RLS-scoped (SECURITY INVOKER) aggregates so the dashboard can
-- render charts from one round trip each instead of pulling raw rows.
-- =====================================================================

-- Invoice count grouped by status (for the status donut).
create or replace function public.invoice_status_counts()
returns table (status text, count bigint)
language sql stable security invoker set search_path = ''
as $$
  select i.status::text, count(*)::bigint
  from public.invoice i
  group by i.status
  order by count(*) desc;
$$;
grant execute on function public.invoice_status_counts() to authenticated;

-- Invoiced vs collected per month, last `months` months (for the trend area).
create or replace function public.revenue_by_month(months int default 6)
returns table (month text, invoiced numeric, collected numeric)
language sql stable security invoker set search_path = ''
as $$
  select
    to_char(m.d, 'Mon') as month,
    coalesce(sum(i.total), 0)::numeric      as invoiced,
    coalesce(sum(i.amount_paid), 0)::numeric as collected
  from (
    select generate_series(
      date_trunc('month', current_date) - make_interval(months => greatest(months, 1) - 1),
      date_trunc('month', current_date),
      interval '1 month'
    ) as d
  ) m
  left join public.invoice i on date_trunc('month', i.invoice_date) = m.d
  group by m.d
  order by m.d;
$$;
grant execute on function public.revenue_by_month(int) to authenticated;

-- Top customers by invoiced total (for the ranking bar).
create or replace function public.top_customers(lim int default 5)
returns table (name text, total numeric)
language sql stable security invoker set search_path = ''
as $$
  select c.name, coalesce(sum(i.total), 0)::numeric as total
  from public.invoice i
  join public.customer c on c.id = i.customer_id
  group by c.name
  order by total desc
  limit greatest(lim, 1);
$$;
grant execute on function public.top_customers(int) to authenticated;


-- ## SOURCE: db/migrations/0012_auto_provision_users.sql

-- =====================================================================
-- 0012 · Auto-provision app_user rows
--
-- So the Admin → Roles & Users screen can see and assign roles to every
-- authenticated user, create an app_user row automatically whenever someone
-- signs up, and backfill anyone who already exists in auth.users.
-- =====================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_user (id, email, display_name, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email, 'User'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill existing auth users that don't yet have a profile row.
insert into public.app_user (id, email, display_name, is_active)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email, 'User'),
  true
from auth.users u
on conflict (id) do nothing;

-- user_role had insert + delete policies but no UPDATE policy; the admin needs
-- it to change a user's data scope (and for upsert-on-conflict to work).
drop policy if exists admin_update_user_roles on public.user_role;
create policy admin_update_user_roles on public.user_role for update to authenticated
  using (public.has_permission('admin.users.edit'))
  with check (public.has_permission('admin.users.edit'));


-- ## SOURCE: db/migrations/0013_security_perf_hardening.sql

-- =====================================================================
-- 0013 · Security & performance hardening (from advisor findings)
-- =====================================================================

-- SECURITY: the auth.users trigger function must not be RPC-callable. It only
-- ever runs as a trigger (which executes as its owner regardless of grants).
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

-- PERFORMANCE (RLS initplan): wrap auth.uid() in a scalar subselect so it is
-- evaluated ONCE per query instead of once per row.
drop policy if exists read_own_overrides on public.user_permission_override;
create policy read_own_overrides on public.user_permission_override for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists read_self on public.app_user;
create policy read_self on public.app_user for select to authenticated
  using (id = (select auth.uid()) or public.has_permission('admin.users.view'));

drop policy if exists admin_read_user_roles on public.user_role;
create policy admin_read_user_roles on public.user_role for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('admin.users.view'));

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check ((select auth.uid()) is not null);

-- PERFORMANCE: covering indexes on foreign keys (speeds up joins, cascade
-- deletes, and especially the created_by columns used by RLS scope checks).
create index if not exists idx_app_user_manager_id on public.app_user(manager_id);
create index if not exists idx_credit_note_created_by on public.credit_note(created_by);
create index if not exists idx_credit_note_customer_id on public.credit_note(customer_id);
create index if not exists idx_credit_note_invoice_id on public.credit_note(invoice_id);
create index if not exists idx_customer_created_by on public.customer(created_by);
create index if not exists idx_customer_default_tax_id on public.customer(default_tax_id);
create index if not exists idx_delivery_note_created_by on public.delivery_note(created_by);
create index if not exists idx_delivery_note_warehouse_id on public.delivery_note(warehouse_id);
create index if not exists idx_delivery_note_line_product_id on public.delivery_note_line(product_id);
create index if not exists idx_delivery_note_line_source_location_id on public.delivery_note_line(source_location_id);
create index if not exists idx_delivery_note_line_uom_id on public.delivery_note_line(uom_id);
create index if not exists idx_invoice_created_by on public.invoice(created_by);
create index if not exists idx_invoice_sales_order_id on public.invoice(sales_order_id);
create index if not exists idx_invoice_line_delivery_note_line_id on public.invoice_line(delivery_note_line_id);
create index if not exists idx_invoice_line_product_id on public.invoice_line(product_id);
create index if not exists idx_invoice_line_sales_order_line_id on public.invoice_line(sales_order_line_id);
create index if not exists idx_invoice_line_tax_id on public.invoice_line(tax_id);
create index if not exists idx_invoice_line_uom_id on public.invoice_line(uom_id);
create index if not exists idx_payment_created_by on public.payment(created_by);
create index if not exists idx_product_created_by on public.product(created_by);
create index if not exists idx_product_tax_id on public.product(tax_id);
create index if not exists idx_product_uom_id on public.product(uom_id);
create index if not exists idx_product_category_parent_id on public.product_category(parent_id);
create index if not exists idx_quotation_created_by on public.quotation(created_by);
create index if not exists idx_quotation_line_product_id on public.quotation_line(product_id);
create index if not exists idx_quotation_line_tax_id on public.quotation_line(tax_id);
create index if not exists idx_quotation_line_uom_id on public.quotation_line(uom_id);
create index if not exists idx_role_permission_permission_id on public.role_permission(permission_id);
create index if not exists idx_sales_order_created_by on public.sales_order(created_by);
create index if not exists idx_sales_order_quotation_id on public.sales_order(quotation_id);
create index if not exists idx_sales_order_line_product_id on public.sales_order_line(product_id);
create index if not exists idx_sales_order_line_quotation_line_id on public.sales_order_line(quotation_line_id);
create index if not exists idx_sales_order_line_tax_id on public.sales_order_line(tax_id);
create index if not exists idx_sales_order_line_uom_id on public.sales_order_line(uom_id);
create index if not exists idx_stock_move_created_by on public.stock_move(created_by);
create index if not exists idx_stock_move_uom_id on public.stock_move(uom_id);
create index if not exists idx_uom_conversion_to_uom_id on public.uom_conversion(to_uom_id);
create index if not exists idx_user_permission_override_permission_id on public.user_permission_override(permission_id);
create index if not exists idx_user_role_role_id on public.user_role(role_id);
create index if not exists idx_vendor_created_by on public.vendor(created_by);
create index if not exists idx_vendor_default_tax_id on public.vendor(default_tax_id);


-- ## SOURCE: db/migrations/0014_sequence_edit_policy.sql

-- =====================================================================
-- 0014 · Allow admins to edit document numbering
--
-- document_sequence had only a SELECT policy, so the Settings UI could show
-- the sequences but not save changes. Add an UPDATE policy gated by the
-- admin.sequence.edit permission.
-- =====================================================================

drop policy if exists admin_write_sequence on public.document_sequence;
create policy admin_write_sequence on public.document_sequence for update to authenticated
  using (public.has_permission('admin.sequence.edit'))
  with check (public.has_permission('admin.sequence.edit'));


-- ## SOURCE: db/migrations/0015_company_bank_whatsapp.sql

-- =====================================================================
-- 0015 · Company fields used by the printed invoice/quotation footer
-- =====================================================================
alter table public.company add column if not exists bank_account text;
alter table public.company add column if not exists whatsapp text;


-- ## SOURCE: db/migrations/0016_company_edit_policy.sql

-- =====================================================================
-- 0016 · Allow admins to edit the company profile
--
-- company had only a SELECT policy; add an UPDATE policy gated by the
-- admin.company.edit permission so the Settings screen can save changes.
-- =====================================================================
drop policy if exists admin_write_company on public.company;
create policy admin_write_company on public.company for update to authenticated
  using (public.has_permission('admin.company.edit'))
  with check (public.has_permission('admin.company.edit'));


-- ## SOURCE: db/migrations/0017_customer_delete_policy.sql

-- =====================================================================
-- 0017 · Allow deleting customers (gated by sales.customer.delete)
--
-- customer had insert/update/select policies but no DELETE policy, so the
-- new row "Delete" action was blocked. product already has a delete policy.
-- =====================================================================
drop policy if exists customer_delete on public.customer;
create policy customer_delete on public.customer for delete to authenticated
  using (public.has_permission('sales.customer.delete') and public.scope_allows(created_by, 'sales'));


-- ## SOURCE: db/migrations/0018_user_role_fk_restrict.sql

-- =====================================================================
-- 0018 · Protect assigned roles from deletion (ON DELETE RESTRICT)
--
-- user_role.role_id previously referenced role(id) ON DELETE CASCADE. With the
-- new "Delete role" admin action, that meant deleting a role could silently
-- strip every user's assignment — and the app-side "is it assigned?" guard can
-- under-count for a caller who holds admin.roles.edit but NOT admin.users.view
-- (RLS hides other users' user_role rows). Making the FK RESTRICT moves the
-- guarantee into the database: a role that is still assigned cannot be deleted.
-- (role_permission.role_id stays ON DELETE CASCADE — a deleted role's grants
-- should disappear with it.)
-- =====================================================================
alter table public.user_role drop constraint if exists user_role_role_id_fkey;
alter table public.user_role
  add constraint user_role_role_id_fkey
  foreign key (role_id) references public.role(id) on delete restrict;


-- ## SOURCE: db/migrations/0019_document_delete_perms_and_policies.sql

-- =====================================================================
-- 0019 · Delete permissions + RLS policies for document tables
-- =====================================================================
insert into public.app_permission (code, module, action, description) values
  ('sales.order.delete',       'sales',     'delete', 'Delete draft/cancelled sales orders'),
  ('inventory.delivery.delete','inventory', 'delete', 'Delete draft/cancelled delivery notes'),
  ('invoice.payment.delete',   'invoice',   'delete', 'Delete payments (restores invoice balance)')
on conflict (code) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r, public.app_permission p
where r.code = 'admin'
  and p.code in ('sales.order.delete','inventory.delivery.delete','invoice.payment.delete')
on conflict (role_id, permission_id) do nothing;

drop policy if exists sales_order_delete on public.sales_order;
create policy sales_order_delete on public.sales_order for delete to authenticated
  using (public.has_permission('sales.order.delete') and public.scope_allows(created_by, 'sales'));

drop policy if exists delivery_delete on public.delivery_note;
create policy delivery_delete on public.delivery_note for delete to authenticated
  using (public.has_permission('inventory.delivery.delete'));

drop policy if exists payment_delete on public.payment;
create policy payment_delete on public.payment for delete to authenticated
  using (public.has_permission('invoice.payment.delete'));



-- ## SOURCE: db/migrations/0020_payment_status_rollup_and_delete_guards.sql

-- =====================================================================
-- 0020 · Payment→invoice status rollup + posted-document delete guards
--
-- (1) rollup_invoice_paid now also keeps invoice.status in sync with the
--     balance. Previously only amount_paid was rolled up, so deleting a payment
--     restored the balance but left a fully-unpaid invoice still marked 'paid'
--     (excluded from AR/outstanding reports). Made SECURITY DEFINER so the
--     recompute always applies regardless of the caller's invoice permissions.
--
-- (2) A BEFORE DELETE guard blocks hard-deleting a POSTED delivery note or
--     invoice at the database level (stock_move has no FK back to delivery_note,
--     and a posted invoice hit the ledger). This holds even for direct PostgREST
--     calls that bypass the app's state check.
-- =====================================================================
create or replace function rollup_invoice_paid(inv_id uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare paid numeric; tot numeric; cur text;
begin
  update invoice
     set amount_paid = coalesce((
       select sum(amount_allocated) from payment_allocation where invoice_id = inv_id
     ), 0)
   where id = inv_id;

  select amount_paid, total, status::text into paid, tot, cur from invoice where id = inv_id;
  if cur is not null and cur not in ('draft','cancelled','closed') then
    update invoice set status = (case
        when paid >= tot - 0.001 and tot > 0 then 'paid'
        when paid > 0 then 'partially_paid'
        else 'invoiced'
      end)::doc_status
    where id = inv_id;
  end if;
end;
$$;

create or replace function public.guard_posted_document_delete() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.posted_at is not null
     or (old.status is not null and old.status::text not in ('draft','cancelled')) then
    raise exception 'This % has been posted/issued and cannot be deleted; cancel or reverse it instead.', tg_table_name
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists delivery_note_guard_delete on public.delivery_note;
create trigger delivery_note_guard_delete before delete on public.delivery_note
  for each row execute function public.guard_posted_document_delete();

drop trigger if exists invoice_guard_delete on public.invoice;
create trigger invoice_guard_delete before delete on public.invoice
  for each row execute function public.guard_posted_document_delete();


-- ## SOURCE: db/migrations/0021_lockdown_rollup_and_usage_stats.sql

-- =====================================================================
-- 0021 · Lock down internal rollup RPC + admin usage stats
--
-- (Security advisor) rollup_invoice_paid / rollup_payment_unallocated are
-- internal trigger helpers and must not be callable via the public RPC
-- endpoint. Make the allocation-rollup trigger SECURITY DEFINER so it can still
-- call them, then revoke EXECUTE from the API roles.
--
-- Also adds admin_usage_stats() powering the in-app "Usage & Limits" card.
-- =====================================================================
create or replace function trg_payment_allocation_rollup() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform rollup_invoice_paid(old.invoice_id);
    perform rollup_payment_unallocated(old.payment_id);
    return old;
  else
    perform rollup_invoice_paid(new.invoice_id);
    perform rollup_payment_unallocated(new.payment_id);
    if tg_op = 'UPDATE' and old.invoice_id <> new.invoice_id then
      perform rollup_invoice_paid(old.invoice_id);
    end if;
    return new;
  end if;
end;
$$;

revoke execute on function public.rollup_invoice_paid(uuid) from anon, authenticated, public;
revoke execute on function public.rollup_payment_unallocated(uuid) from anon, authenticated, public;

create or replace function public.admin_usage_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not (public.has_permission('admin.company.edit') or public.has_permission('admin.roles.view')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0),
    'storage_objects', (select count(*) from storage.objects),
    'auth_users', (select count(*) from auth.users),
    'tables', (
      select coalesce(jsonb_agg(t order by t.bytes desc), '[]'::jsonb) from (
        select c.relname as name,
               pg_total_relation_size(c.oid) as bytes,
               greatest(c.reltuples, 0)::bigint as est_rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 8
      ) t
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_usage_stats() from anon, public;
grant execute on function public.admin_usage_stats() to authenticated;


-- ## SOURCE: db/migrations/0022_product_sku_sequence.sql

-- =====================================================================
-- 0022 · Product SKU numbering sequence
--
-- Lets the product form auto-generate a SKU (e.g. SKU-00001) when the user
-- leaves the field blank, mirroring how customer codes and document numbers
-- already work. Not reset yearly — SKUs are permanent identifiers.
-- =====================================================================
insert into public.document_sequence (code, prefix, format, padding, next_number, reset_yearly)
select 'product', 'SKU', '{PREFIX}-{SEQ}', 5, 1, false
where not exists (select 1 from public.document_sequence where code = 'product');


-- ## SOURCE: db/migrations/0023_procurement_vendor_perms_rls.sql

-- =====================================================================
-- 0023 · Procurement module: vendor permissions + RLS
--
-- The vendor table had RLS enabled but NO policies (it was locked). Adds the
-- procurement.vendor.* permissions (granted to admin) and read/insert/update/
-- delete policies, mirroring the customer master.
-- =====================================================================
insert into public.app_permission (code, module, action, description) values
  ('procurement.vendor.view',   'procurement', 'view',   'View vendors'),
  ('procurement.vendor.create', 'procurement', 'create', 'Create vendors'),
  ('procurement.vendor.edit',   'procurement', 'edit',   'Edit vendors'),
  ('procurement.vendor.delete', 'procurement', 'delete', 'Delete vendors')
on conflict (code) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r, public.app_permission p
where r.code = 'admin' and p.module = 'procurement'
on conflict (role_id, permission_id) do nothing;

drop policy if exists vendor_read on public.vendor;
create policy vendor_read on public.vendor for select to authenticated
  using (public.has_permission('procurement.vendor.view') and public.scope_allows(created_by, 'procurement'));

drop policy if exists vendor_insert on public.vendor;
create policy vendor_insert on public.vendor for insert to authenticated
  with check (public.has_permission('procurement.vendor.create'));

drop policy if exists vendor_update on public.vendor;
create policy vendor_update on public.vendor for update to authenticated
  using (public.has_permission('procurement.vendor.edit') and public.scope_allows(created_by, 'procurement'))
  with check (public.has_permission('procurement.vendor.edit'));

drop policy if exists vendor_delete on public.vendor;
create policy vendor_delete on public.vendor for delete to authenticated
  using (public.has_permission('procurement.vendor.delete') and public.scope_allows(created_by, 'procurement'));


-- ## SOURCE: db/migrations/0024_stock_on_hand_rpc.sql

-- =====================================================================
-- 0024 · stock_on_hand() RPC for the Inventory screen
--
-- Per-product on hand = quantity moved INTO 'stock' locations minus quantity
-- moved OUT of them. SECURITY DEFINER, gated by inventory.stock.view; cost/value
-- only included when the caller holds inventory.product.view_cost.
-- =====================================================================
create or replace function public.stock_on_hand()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb; show_cost boolean;
begin
  if not public.has_permission('inventory.stock.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  show_cost := public.has_permission('inventory.product.view_cost');

  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb) into result
  from (
    select
      p.id as product_id, p.sku, p.name, u.code as uom,
      (
        coalesce((select sum(sm.quantity) from stock_move sm
                    join location dl on dl.id = sm.dest_location_id
                  where sm.product_id = p.id and dl.kind = 'stock'), 0)
        - coalesce((select sum(sm.quantity) from stock_move sm
                    join location sl on sl.id = sm.source_location_id
                   where sm.product_id = p.id and sl.kind = 'stock'), 0)
      ) as on_hand,
      p.reorder_point,
      case when show_cost then p.cost_price else null end as cost_price
    from product p
    left join unit_of_measure u on u.id = p.uom_id
    where p.is_stockable = true and p.is_active = true
  ) t;

  return result;
end;
$$;

revoke execute on function public.stock_on_hand() from anon, public;
grant execute on function public.stock_on_hand() to authenticated;


-- ## SOURCE: db/migrations/0025_reports_summary_rpc.sql

-- =====================================================================
-- 0025 · reports_summary() RPC powering the Reports page
--
-- Returns totals, AR aging buckets, top products, top customers and a 12-month
-- revenue trend. SECURITY DEFINER, gated by invoice.view.
-- =====================================================================
create or replace function public.reports_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb; today date := current_date;
begin
  if not public.has_permission('invoice.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'invoice_count', count(*),
        'revenue', coalesce(sum(total), 0),
        'collected', coalesce(sum(amount_paid), 0),
        'outstanding', coalesce(sum(balance), 0)
      )
      from invoice where status not in ('cancelled', 'draft')
    ),
    'ar_aging', (
      select jsonb_build_object(
        'not_due',  coalesce(sum(case when due_date >= today then balance else 0 end), 0),
        'd1_30',    coalesce(sum(case when due_date < today and due_date >= today - 30 then balance else 0 end), 0),
        'd31_60',   coalesce(sum(case when due_date < today - 30 and due_date >= today - 60 then balance else 0 end), 0),
        'd60_plus', coalesce(sum(case when due_date < today - 60 then balance else 0 end), 0)
      )
      from invoice where balance > 0.001 and status not in ('cancelled', 'draft')
    ),
    'top_products', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select coalesce(pr.name, il.description) as name,
               sum(il.line_total) as revenue, sum(il.quantity) as qty
        from invoice_line il
        join invoice i on i.id = il.invoice_id and i.status not in ('cancelled', 'draft')
        left join product pr on pr.id = il.product_id
        group by coalesce(pr.name, il.description)
        order by sum(il.line_total) desc
        limit 8
      ) x
    ),
    'top_customers', (
      select coalesce(jsonb_agg(row_to_json(y)), '[]'::jsonb) from (
        select c.name, sum(i.total) as revenue, count(*) as invoices
        from invoice i join customer c on c.id = i.customer_id
        where i.status not in ('cancelled', 'draft')
        group by c.name order by sum(i.total) desc limit 8
      ) y
    ),
    'revenue_by_month', (
      select coalesce(jsonb_agg(row_to_json(z) order by z.month), '[]'::jsonb) from (
        select to_char(date_trunc('month', invoice_date), 'YYYY-MM') as month, sum(total) as revenue
        from invoice
        where status not in ('cancelled', 'draft') and invoice_date >= (today - interval '12 months')
        group by date_trunc('month', invoice_date)
      ) z
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.reports_summary() from anon, public;
grant execute on function public.reports_summary() to authenticated;


-- ## SOURCE: db/migrations/0026_purchase_orders.sql

-- =====================================================================
-- 0026 · Purchase Orders (procurement)
--
-- Vendor-facing counterpart of the sales order: draft → confirmed → received.
-- Receiving posts stock IN (vendor location → warehouse stock location) via the
-- server action. Includes tables, numbering sequence, permissions and RLS.
-- =====================================================================
create table if not exists public.purchase_order (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  vendor_id uuid not null references public.vendor(id),
  order_date date not null default current_date,
  expected_date date,
  warehouse_id uuid references public.warehouse(id),
  currency text not null default 'AED',
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  status public.doc_status not null default 'draft',
  notes text,
  received_at timestamptz,
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_purchase_order_vendor_id on public.purchase_order (vendor_id);
drop trigger if exists purchase_order_updated on public.purchase_order;
create trigger purchase_order_updated before update on public.purchase_order
  for each row execute function public.set_updated_at();

create table if not exists public.purchase_order_line (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_order(id) on delete cascade,
  sequence int not null default 0,
  product_id uuid references public.product(id),
  description text not null,
  quantity numeric(18,3) not null default 1,
  quantity_received numeric(18,3) not null default 0,
  uom_id uuid references public.unit_of_measure(id),
  unit_price numeric(18,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  tax_id uuid references public.tax_rate(id),
  line_subtotal numeric(18,2) not null default 0,
  line_discount numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0
);
create index if not exists idx_purchase_order_line_po on public.purchase_order_line (purchase_order_id);

insert into public.document_sequence (code, prefix, format, padding, next_number, reset_yearly)
select 'purchase_order', 'PO', '{PREFIX}-{YYYY}-{SEQ}', 5, 1, true
where not exists (select 1 from public.document_sequence where code = 'purchase_order');

insert into public.app_permission (code, module, action, description) values
  ('procurement.po.view',    'procurement', 'view',    'View purchase orders'),
  ('procurement.po.create',  'procurement', 'create',  'Create purchase orders'),
  ('procurement.po.edit',    'procurement', 'edit',    'Edit purchase orders'),
  ('procurement.po.confirm', 'procurement', 'approve', 'Confirm purchase orders'),
  ('procurement.po.receive', 'procurement', 'approve', 'Receive purchase orders into stock'),
  ('procurement.po.cancel',  'procurement', 'approve', 'Cancel purchase orders'),
  ('procurement.po.delete',  'procurement', 'delete',  'Delete purchase orders')
on conflict (code) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r, public.app_permission p
where r.code = 'admin' and p.module = 'procurement'
on conflict (role_id, permission_id) do nothing;

alter table public.purchase_order enable row level security;
alter table public.purchase_order_line enable row level security;

drop policy if exists po_read on public.purchase_order;
create policy po_read on public.purchase_order for select to authenticated
  using (public.has_permission('procurement.po.view') and public.scope_allows(created_by, 'procurement'));
drop policy if exists po_insert on public.purchase_order;
create policy po_insert on public.purchase_order for insert to authenticated
  with check (public.has_permission('procurement.po.create'));
drop policy if exists po_update on public.purchase_order;
create policy po_update on public.purchase_order for update to authenticated
  using (public.has_permission('procurement.po.edit') and public.scope_allows(created_by, 'procurement'))
  with check (public.has_permission('procurement.po.edit'));
drop policy if exists po_delete on public.purchase_order;
create policy po_delete on public.purchase_order for delete to authenticated
  using (public.has_permission('procurement.po.delete') and public.scope_allows(created_by, 'procurement'));

drop policy if exists po_line_all on public.purchase_order_line;
create policy po_line_all on public.purchase_order_line for all to authenticated
  using (exists (select 1 from public.purchase_order po where po.id = purchase_order_id
                   and public.has_permission('procurement.po.view')
                   and public.scope_allows(po.created_by, 'procurement')))
  with check (exists (select 1 from public.purchase_order po where po.id = purchase_order_id
                        and public.has_permission('procurement.po.edit')));


-- ## SOURCE: db/migrations/0027_lockdown_rollup_trigger_fn.sql

-- =====================================================================
-- 0027 · Revoke direct RPC access to the rollup trigger function
--
-- trg_payment_allocation_rollup was made SECURITY DEFINER in 0021, which left it
-- callable via /rest/v1/rpc. Trigger functions fire without an EXECUTE grant, so
-- revoke direct execution (security advisor 0028/0029).
-- =====================================================================
revoke execute on function public.trg_payment_allocation_rollup() from anon, authenticated, public;


-- ## SOURCE: db/migrations/0028_audit_logging.sql

-- =====================================================================
-- 0028 · Audit logging
--
-- A generic trigger records every insert/update/delete on the financial and
-- master tables into audit_log, capturing the acting user (auth.uid()) and, for
-- updates, only the columns that changed. SECURITY DEFINER so it always writes.
-- Viewable by admins in Settings → Audit log (admin.audit.view).
-- =====================================================================
create or replace function public.audit_trigger() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  old_j jsonb;
  new_j jsonb;
  chg jsonb;
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log(user_id, table_name, record_id, action, changes)
    values (uid, tg_table_name, old.id::text, 'delete', to_jsonb(old));
    return old;
  elsif tg_op = 'INSERT' then
    insert into public.audit_log(user_id, table_name, record_id, action, changes)
    values (uid, tg_table_name, new.id::text, 'insert', to_jsonb(new));
    return new;
  else
    old_j := to_jsonb(old);
    new_j := to_jsonb(new);
    select jsonb_object_agg(k.key, jsonb_build_object('from', old_j -> k.key, 'to', new_j -> k.key))
      into chg
    from jsonb_object_keys(new_j) as k(key)
    where (old_j -> k.key) is distinct from (new_j -> k.key)
      and k.key <> 'updated_at';
    if chg is null then return new; end if;
    insert into public.audit_log(user_id, table_name, record_id, action, changes)
    values (uid, tg_table_name, new.id::text, 'update', chg);
    return new;
  end if;
end;
$$;

revoke execute on function public.audit_trigger() from anon, authenticated, public;

do $$
declare t text;
begin
  foreach t in array array['invoice','payment','purchase_order','sales_order','quotation',
                           'delivery_note','customer','vendor','product']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;


-- ## SOURCE: db/migrations/0029_dashboard_operational_rpc.sql

-- =====================================================================
-- 0029 · dashboard_operational() RPC — actionable dashboard metrics
--
-- Overdue / due-soon receivables, cash collected this month, orders awaiting
-- delivery & invoicing, open POs, low-stock count, plus overdue-invoice and
-- low-stock action lists. SECURITY DEFINER; authenticated-only.
-- =====================================================================
create or replace function public.dashboard_operational()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb; today date := current_date;
begin
  select jsonb_build_object(
    'overdue', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(balance),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft') and due_date < today),
    'due_soon', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(balance),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft') and due_date >= today and due_date <= today + 7),
    'collected_month', (select coalesce(sum(pa.amount_allocated),0)
      from payment p join payment_allocation pa on pa.payment_id = p.id
      where p.payment_date >= date_trunc('month', today)::date),
    'draft_quotations', (select count(*) from quotation where status = 'draft'),
    'awaiting_delivery', (select count(distinct so.id) from sales_order so
      join sales_order_line l on l.sales_order_id = so.id
      where so.status not in ('cancelled','closed') and l.quantity_ordered > l.quantity_delivered),
    'awaiting_invoice', (select count(distinct so.id) from sales_order so
      join sales_order_line l on l.sales_order_id = so.id
      where so.status not in ('cancelled','closed') and l.quantity_delivered > l.quantity_invoiced),
    'open_pos', (select count(*) from purchase_order where status = 'confirmed'),
    'low_stock', (select count(*) from (
        select p.reorder_point,
          coalesce((select sum(sm.quantity) from stock_move sm join location dl on dl.id=sm.dest_location_id where sm.product_id=p.id and dl.kind='stock'),0)
          - coalesce((select sum(sm.quantity) from stock_move sm join location sl on sl.id=sm.source_location_id where sm.product_id=p.id and sl.kind='stock'),0) as oh
        from product p where p.is_stockable and p.is_active
      ) s where s.reorder_point is not null and s.oh <= s.reorder_point),
    'overdue_list', (select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select i.id, i.number, c.name as customer, i.due_date, i.balance
        from invoice i join customer c on c.id = i.customer_id
        where i.balance > 0.001 and i.status not in ('cancelled','draft') and i.due_date < today
        order by i.due_date asc limit 8) x),
    'low_stock_list', (select coalesce(jsonb_agg(row_to_json(z)),'[]'::jsonb) from (
        select y.sku, y.name, y.reorder_point, y.on_hand from (
          select p.sku, p.name, p.reorder_point,
            coalesce((select sum(sm.quantity) from stock_move sm join location dl on dl.id=sm.dest_location_id where sm.product_id=p.id and dl.kind='stock'),0)
            - coalesce((select sum(sm.quantity) from stock_move sm join location sl on sl.id=sm.source_location_id where sm.product_id=p.id and sl.kind='stock'),0) as on_hand
          from product p where p.is_stockable and p.is_active
        ) y where y.reorder_point is not null and y.on_hand <= y.reorder_point
        order by y.on_hand asc limit 8) z)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.dashboard_operational() from anon, public;
grant execute on function public.dashboard_operational() to authenticated;


-- ## SOURCE: db/migrations/0030_reports_summary_date_range.sql

-- =====================================================================
-- 0030 · reports_summary(from_date, to_date) — date-range filter
--
-- Replaces the no-arg reports_summary() with a parameterized version. AR aging
-- stays "as of today"; totals / top lists / revenue trend honor the range
-- (null = all time, or last 12 months for the trend).
-- =====================================================================
drop function if exists public.reports_summary();

create or replace function public.reports_summary(from_date date default null, to_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb; today date := current_date;
begin
  if not public.has_permission('invoice.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    'totals', (
      select jsonb_build_object(
        'invoice_count', count(*), 'revenue', coalesce(sum(total),0),
        'collected', coalesce(sum(amount_paid),0), 'outstanding', coalesce(sum(balance),0))
      from invoice
      where status not in ('cancelled','draft')
        and (from_date is null or invoice_date >= from_date)
        and (to_date   is null or invoice_date <= to_date)),
    'ar_aging', (
      select jsonb_build_object(
        'not_due',  coalesce(sum(case when due_date >= today then balance else 0 end),0),
        'd1_30',    coalesce(sum(case when due_date < today and due_date >= today - 30 then balance else 0 end),0),
        'd31_60',   coalesce(sum(case when due_date < today - 30 and due_date >= today - 60 then balance else 0 end),0),
        'd60_plus', coalesce(sum(case when due_date < today - 60 then balance else 0 end),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft')),
    'top_products', (
      select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select coalesce(pr.name, il.description) as name, sum(il.line_total) as revenue, sum(il.quantity) as qty
        from invoice_line il
        join invoice i on i.id = il.invoice_id and i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        left join product pr on pr.id = il.product_id
        group by coalesce(pr.name, il.description) order by sum(il.line_total) desc limit 8) x),
    'top_customers', (
      select coalesce(jsonb_agg(row_to_json(y)),'[]'::jsonb) from (
        select c.name, sum(i.total) as revenue, count(*) as invoices
        from invoice i join customer c on c.id = i.customer_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        group by c.name order by sum(i.total) desc limit 8) y),
    'revenue_by_month', (
      select coalesce(jsonb_agg(row_to_json(z) order by z.month),'[]'::jsonb) from (
        select to_char(date_trunc('month', invoice_date),'YYYY-MM') as month, sum(total) as revenue
        from invoice
        where status not in ('cancelled','draft')
          and invoice_date >= coalesce(from_date, today - interval '12 months')
          and (to_date is null or invoice_date <= to_date)
        group by date_trunc('month', invoice_date)) z)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.reports_summary(date, date) from anon, public;
grant execute on function public.reports_summary(date, date) to authenticated;


-- ## SOURCE: db/migrations/0031_post_invoice_stock_moves.sql

-- =====================================================================
-- 0031 · Invoice-only stock issue
--
-- Posting an invoice (posted_at NULL -> set) now issues stock for each stockable
-- line (warehouse 'stock' location -> 'customer' location), so on-hand drops
-- without a delivery note. Delivery notes remain available but are optional in
-- this mode — do NOT also post a delivery note for the same goods or stock will
-- be deducted twice.
-- =====================================================================
create or replace function public.post_invoice_stock_moves() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ln record;
  customer_loc uuid;
  ship_from uuid;
begin
  if new.posted_at is null or old.posted_at is not null then
    return new;
  end if;

  select id into customer_loc from location where kind = 'customer' limit 1;
  select id into ship_from   from location where kind = 'stock'    limit 1;
  if customer_loc is null or ship_from is null then
    return new;
  end if;

  for ln in
    select il.product_id, il.uom_id, il.quantity
    from invoice_line il
    join product p on p.id = il.product_id
    where il.invoice_id = new.id and p.is_stockable = true and il.quantity > 0
  loop
    insert into stock_move (product_id, uom_id, quantity, source_location_id, dest_location_id,
                            reference_type, reference_id, move_date, created_by)
    values (ln.product_id, ln.uom_id, ln.quantity, ship_from, customer_loc,
            'invoice', new.id, current_date, new.created_by);
  end loop;

  return new;
end;
$$;

drop trigger if exists post_invoice_stock_moves on public.invoice;
create trigger post_invoice_stock_moves after update on public.invoice
  for each row execute function public.post_invoice_stock_moves();


-- ## SOURCE: db/migrations/0032_invoice_stock_no_double_count.sql

-- =====================================================================
-- 0032 · Prevent double-counting stock between delivery notes and invoices
--
-- Both delivery notes and invoices are supported. Stock for a unit is issued
-- exactly once: an invoice now issues stock ONLY for lines that were NOT already
-- shipped via a delivery note (invoice_line.delivery_note_line_id IS NULL).
-- Lines billed from a posted delivery already had their stock issued there.
-- =====================================================================
create or replace function public.post_invoice_stock_moves() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ln record;
  customer_loc uuid;
  ship_from uuid;
begin
  if new.posted_at is null or old.posted_at is not null then
    return new;
  end if;

  select id into customer_loc from location where kind = 'customer' limit 1;
  select id into ship_from   from location where kind = 'stock'    limit 1;
  if customer_loc is null or ship_from is null then
    return new;
  end if;

  for ln in
    select il.product_id, il.uom_id, il.quantity
    from invoice_line il
    join product p on p.id = il.product_id
    where il.invoice_id = new.id
      and p.is_stockable = true
      and il.quantity > 0
      and il.delivery_note_line_id is null   -- not already shipped via a delivery note
  loop
    insert into stock_move (product_id, uom_id, quantity, source_location_id, dest_location_id,
                            reference_type, reference_id, move_date, created_by)
    values (ln.product_id, ln.uom_id, ln.quantity, ship_from, customer_loc,
            'invoice', new.id, current_date, new.created_by);
  end loop;

  return new;
end;
$$;


-- ## SOURCE: db/migrations/0033_product_category_write_policies.sql

-- =====================================================================
-- 0033 · Allow creating/editing product categories
--
-- product_category previously had only a SELECT policy, so categories could not
-- be added from the app. Adds write policies gated by the product permissions,
-- powering the "+ New category" quick-add on the product form.
-- =====================================================================
drop policy if exists category_insert on public.product_category;
create policy category_insert on public.product_category for insert to authenticated
  with check (public.has_permission('inventory.product.create'));

drop policy if exists category_update on public.product_category;
create policy category_update on public.product_category for update to authenticated
  using (public.has_permission('inventory.product.edit'))
  with check (public.has_permission('inventory.product.edit'));

drop policy if exists category_delete on public.product_category;
create policy category_delete on public.product_category for delete to authenticated
  using (public.has_permission('inventory.product.delete'));


-- ## SOURCE: db/migrations/0034_reference_tables_editable.sql

-- =====================================================================
-- 0034 · Make reference/lookup tables editable
--
-- Adds write RLS (gated by admin.company.edit) for unit_of_measure, tax_rate and
-- warehouse (they previously had read-only policies), powering the new
-- Settings → Reference data admin. Also backfills a created_at on
-- unit_of_measure, which lacked one.
-- =====================================================================
alter table public.unit_of_measure add column if not exists created_at timestamptz not null default now();

drop policy if exists uom_insert on public.unit_of_measure;
create policy uom_insert on public.unit_of_measure for insert to authenticated
  with check (public.has_permission('admin.company.edit'));
drop policy if exists uom_update on public.unit_of_measure;
create policy uom_update on public.unit_of_measure for update to authenticated
  using (public.has_permission('admin.company.edit')) with check (public.has_permission('admin.company.edit'));
drop policy if exists uom_delete on public.unit_of_measure;
create policy uom_delete on public.unit_of_measure for delete to authenticated
  using (public.has_permission('admin.company.edit'));

drop policy if exists tax_insert on public.tax_rate;
create policy tax_insert on public.tax_rate for insert to authenticated
  with check (public.has_permission('admin.company.edit'));
drop policy if exists tax_update on public.tax_rate;
create policy tax_update on public.tax_rate for update to authenticated
  using (public.has_permission('admin.company.edit')) with check (public.has_permission('admin.company.edit'));
drop policy if exists tax_delete on public.tax_rate;
create policy tax_delete on public.tax_rate for delete to authenticated
  using (public.has_permission('admin.company.edit'));

drop policy if exists warehouse_insert on public.warehouse;
create policy warehouse_insert on public.warehouse for insert to authenticated
  with check (public.has_permission('admin.company.edit'));
drop policy if exists warehouse_update on public.warehouse;
create policy warehouse_update on public.warehouse for update to authenticated
  using (public.has_permission('admin.company.edit')) with check (public.has_permission('admin.company.edit'));
drop policy if exists warehouse_delete on public.warehouse;
create policy warehouse_delete on public.warehouse for delete to authenticated
  using (public.has_permission('admin.company.edit'));

-- ## SOURCE: db/migrations/0035_vat_report.sql
-- =====================================================================
-- 0035 · vat_report(from_date, to_date) — UAE VAT (FTA VAT201-style) summary
--
-- Output VAT (on sales) from invoices, Input VAT (on purchases) from purchase
-- orders, net VAT payable, a breakdown of output VAT by tax rate, and a
-- per-invoice detail listing. Honors the date range (null = all time).
-- Perm-gated (invoice.view); SECURITY DEFINER so it can read across scopes for
-- a finance/compliance report, exactly like reports_summary.
-- =====================================================================
create or replace function public.vat_report(from_date date default null, to_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not public.has_permission('invoice.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    -- Output VAT: what you charged customers
    'output', (
      select jsonb_build_object(
        'taxable', coalesce(sum(subtotal - discount_total), 0),
        'vat',     coalesce(sum(tax_total), 0),
        'count',   count(*))
      from invoice
      where status not in ('cancelled','draft')
        and (from_date is null or invoice_date >= from_date)
        and (to_date   is null or invoice_date <= to_date)),
    -- Input VAT: what you paid vendors (recoverable)
    'input', (
      select jsonb_build_object(
        'taxable', coalesce(sum(subtotal - discount_total), 0),
        'vat',     coalesce(sum(tax_total), 0),
        'count',   count(*))
      from purchase_order
      where status not in ('cancelled','draft')
        and (from_date is null or order_date >= from_date)
        and (to_date   is null or order_date <= to_date)),
    -- Output VAT split by tax rate (VAT201 boxes: standard 5% / zero / exempt)
    'by_rate', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select coalesce(tr.code, 'No tax')      as code,
               coalesce(tr.rate, 0)             as rate,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as taxable,
               coalesce(sum(il.line_tax), 0)    as vat
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        left join tax_rate tr on tr.id = il.tax_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        group by tr.code, tr.rate
        order by coalesce(tr.rate, 0) desc
      ) x),
    -- Per-invoice detail (the backing list for the VAT return)
    'invoices', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select i.number,
               i.invoice_date,
               c.name as customer,
               (i.subtotal - i.discount_total) as taxable,
               i.tax_total as vat,
               i.total
        from invoice i
        join customer c on c.id = i.customer_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        order by i.invoice_date, i.number
        limit 1000
      ) x)
  ) into result;

  return result;
end $$;

revoke execute on function public.vat_report(date, date) from anon;
grant execute on function public.vat_report(date, date) to authenticated;

-- ## SOURCE: db/migrations/0036_valuation_profit_reports.sql
-- =====================================================================
-- 0036 · stock_valuation() + profit_report(from,to)
--
-- Both expose COST data, so both are gated on inventory.product.view_cost
-- (the same permission that unmasks cost_price / margin elsewhere), NOT just
-- invoice.view. SECURITY DEFINER so the figures aggregate across scopes.
--
-- Valuation uses standard cost (product.cost_price) — the maintained cost on
-- the product card. COGS in the profit report likewise uses the product's
-- current cost_price (there is no cost-at-sale column captured on the line),
-- so profit is an approximation based on today's costs.
-- =====================================================================

-- ---- Stock valuation: on-hand × cost, per stockable product ----------
create or replace function public.stock_valuation()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not public.has_permission('inventory.product.view_cost') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'items',       coalesce(jsonb_agg(row_to_json(t) order by t.value desc), '[]'::jsonb),
    'total_value', coalesce(sum(t.value), 0),
    'total_lines', count(*)
  ) into result
  from (
    select sku, name, category, uom, on_hand, cost, (on_hand * cost) as value
    from (
      select p.sku, p.name,
             coalesce(c.name, '—') as category,
             u.code as uom,
             p.cost_price as cost,
             (
               coalesce((select sum(sm.quantity) from stock_move sm
                           join location dl on dl.id = sm.dest_location_id
                         where sm.product_id = p.id and dl.kind = 'stock'), 0)
               - coalesce((select sum(sm.quantity) from stock_move sm
                           join location sl on sl.id = sm.source_location_id
                          where sm.product_id = p.id and sl.kind = 'stock'), 0)
             ) as on_hand
      from product p
      left join unit_of_measure u on u.id = p.uom_id
      left join product_category c on c.id = p.category_id
      where p.is_stockable = true and p.is_active = true
    ) q
    where q.on_hand <> 0
  ) t;

  return result;
end $$;

revoke execute on function public.stock_valuation() from anon, public;
grant execute on function public.stock_valuation() to authenticated;

-- ---- Profit / gross margin: revenue - COGS -------------------------------
create or replace function public.profit_report(from_date date default null, to_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not public.has_permission('inventory.product.view_cost') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    'totals', (
      select jsonb_build_object(
        'revenue', coalesce(sum(il.line_subtotal - il.line_discount), 0),
        'cost',    coalesce(sum(il.quantity * coalesce(p.cost_price, 0)), 0),
        'profit',  coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price, 0)), 0))
      from invoice_line il
      join invoice i on i.id = il.invoice_id
      left join product p on p.id = il.product_id
      where i.status not in ('cancelled','draft')
        and (from_date is null or i.invoice_date >= from_date)
        and (to_date   is null or i.invoice_date <= to_date)),
    'by_product', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select coalesce(p.name, il.description) as name,
               coalesce(sum(il.quantity), 0) as qty,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as revenue,
               coalesce(sum(il.quantity * coalesce(p.cost_price, 0)), 0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price, 0)), 0) as profit
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        left join product p on p.id = il.product_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        group by coalesce(p.name, il.description)
        order by profit desc
        limit 20
      ) x),
    'by_customer', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select c.name as name,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as revenue,
               coalesce(sum(il.quantity * coalesce(p.cost_price, 0)), 0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price, 0)), 0) as profit
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        join customer c on c.id = i.customer_id
        left join product p on p.id = il.product_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        group by c.name
        order by profit desc
        limit 20
      ) x)
  ) into result;

  return result;
end $$;

revoke execute on function public.profit_report(date, date) from anon, public;
grant execute on function public.profit_report(date, date) to authenticated;

-- ## SOURCE: db/migrations/0037_status_override.sql
-- =====================================================================
-- 0037 · Admin status override
--
-- A grantable permission ('admin.status.override') + a SECURITY DEFINER RPC to
-- set a document's status directly. This is a MANUAL label change only — it
-- does NOT create/reverse stock movements or payments (those stay driven by
-- posting / payments). The RPC bypasses per-table edit RLS on purpose so the
-- permission alone is sufficient; it is gated on the permission internally.
-- =====================================================================

insert into public.app_permission (code, module, action, description)
values ('admin.status.override', 'admin', 'update',
        'Manually override any document status (does not move stock or money)')
on conflict (code) do nothing;

insert into public.role_permission (role_id, permission_id)
  select r.id, p.id from public.role r cross join public.app_permission p
   where r.code = 'admin' and p.code = 'admin.status.override'
on conflict do nothing;

create or replace function public.override_document_status(p_entity text, p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare tbl text;
begin
  if not public.has_permission('admin.status.override') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  tbl := case p_entity
           when 'quotation'      then 'quotation'
           when 'sales_order'    then 'sales_order'
           when 'delivery_note'  then 'delivery_note'
           when 'invoice'        then 'invoice'
           when 'purchase_order' then 'purchase_order'
           else null
         end;
  if tbl is null then
    raise exception 'unknown entity %', p_entity using errcode = '22023';
  end if;

  execute format('update public.%I set status = $1::doc_status where id = $2', tbl)
    using p_status, p_id;
end $$;

revoke execute on function public.override_document_status(text, uuid, text) from anon, public;
grant execute on function public.override_document_status(text, uuid, text) to authenticated;
