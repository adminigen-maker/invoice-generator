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
