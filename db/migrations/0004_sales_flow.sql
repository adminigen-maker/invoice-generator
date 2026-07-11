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
