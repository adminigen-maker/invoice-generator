-- =====================================================================
-- Invoice UAE — Consolidated schema (all migrations 0001–0009)
--
-- One-shot install: paste this entire file into the Supabase SQL Editor
-- (Dashboard → SQL Editor → New query → Run). It runs the migrations in
-- order: extensions/types → RBAC → master data → sales flow →
-- invoicing/payments → inventory → RLS policies → seed data →
-- security hardening. Validated end-to-end against a real Postgres engine
-- and against a live Supabase project (0 errors on the security advisor).
--
-- Generated from db/migrations/*.sql; edit those, not this file, then
-- regenerate. Run on a fresh project (or after `supabase db reset`).
-- =====================================================================


-- #####################################################################
-- ## SOURCE: db/migrations/0001_extensions_and_types.sql
-- #####################################################################

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


-- #####################################################################
-- ## SOURCE: db/migrations/0002_rbac.sql
-- #####################################################################

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


-- #####################################################################
-- ## SOURCE: db/migrations/0003_master_data.sql
-- #####################################################################

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


-- #####################################################################
-- ## SOURCE: db/migrations/0004_sales_flow.sql
-- #####################################################################

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


-- #####################################################################
-- ## SOURCE: db/migrations/0005_invoicing_and_payments.sql
-- #####################################################################

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


-- #####################################################################
-- ## SOURCE: db/migrations/0006_inventory.sql
-- #####################################################################

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


-- #####################################################################
-- ## SOURCE: db/migrations/0007_rls_policies.sql
-- #####################################################################

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


-- #####################################################################
-- ## SOURCE: db/migrations/0008_seed_rbac_and_defaults.sql
-- #####################################################################

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


-- #####################################################################
-- ## SOURCE: db/migrations/0009_security_hardening.sql
-- #####################################################################

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

