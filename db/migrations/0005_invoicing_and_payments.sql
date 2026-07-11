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
