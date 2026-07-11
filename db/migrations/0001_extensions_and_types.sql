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
