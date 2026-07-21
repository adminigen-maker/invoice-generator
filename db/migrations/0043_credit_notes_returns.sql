-- =====================================================================
-- 0043 · Customer returns via credit notes
--
-- A credit note is raised FROM an invoice (UI lives on the invoice page). It
-- records which lines/quantities came back, puts the goods back into normal
-- stock, and reduces the invoice's balance — without ever editing the invoice,
-- so the document the customer holds and the VAT already reported stay intact.
-- =====================================================================
alter table public.credit_note add column if not exists subtotal   numeric(18,2) not null default 0;
alter table public.credit_note add column if not exists tax_total  numeric(18,2) not null default 0;
alter table public.credit_note add column if not exists posted_at  timestamptz;

create table if not exists public.credit_note_line (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references public.credit_note(id) on delete cascade,
  invoice_line_id uuid references public.invoice_line(id),
  sequence int not null default 0,
  product_id uuid references public.product(id),
  description text not null,
  quantity numeric(18,4) not null default 0,
  uom_id uuid references public.unit_of_measure(id),
  unit_price numeric(18,4) not null default 0,
  discount_pct numeric(6,3) not null default 0,
  tax_id uuid references public.tax_rate(id),
  line_subtotal numeric(18,2) not null default 0,
  line_discount numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0
);
create index if not exists idx_credit_note_line_cn on public.credit_note_line (credit_note_id);
create index if not exists idx_credit_note_invoice on public.credit_note (invoice_id);

alter table public.credit_note_line enable row level security;
drop policy if exists credit_note_line_all on public.credit_note_line;
create policy credit_note_line_all on public.credit_note_line for all
  using (public.has_permission('invoice.credit_note.view'))
  with check (public.has_permission('invoice.credit_note.create'));

alter table public.invoice add column if not exists credited_total numeric(18,2) not null default 0;
alter table public.invoice drop column if exists balance;
alter table public.invoice add column balance numeric(18,2)
  generated always as (total - amount_paid - credited_total) stored;

create or replace function public.recompute_invoice_status(inv_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare paid numeric; credited numeric; tot numeric; cur text;
begin
  select amount_paid, credited_total, total, status::text
    into paid, credited, tot, cur
  from invoice where id = inv_id;
  if cur is not null and cur not in ('draft','cancelled','closed') then
    update invoice set status = (case
        when (coalesce(paid,0) + coalesce(credited,0)) >= tot - 0.001 and tot > 0 then 'paid'
        when coalesce(paid,0) > 0 then 'partially_paid'
        else 'invoiced'
      end)::doc_status
    where id = inv_id;
  end if;
end $$;

create or replace function public.rollup_invoice_paid(inv_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update invoice
     set amount_paid = coalesce((select sum(amount_allocated) from payment_allocation where invoice_id = inv_id), 0)
   where id = inv_id;
  perform public.recompute_invoice_status(inv_id);
end $$;

create or replace function public.rollup_invoice_credited(inv_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update invoice
     set credited_total = coalesce((
       select sum(total) from credit_note where invoice_id = inv_id and status <> 'cancelled'
     ), 0)
   where id = inv_id;
  perform public.recompute_invoice_status(inv_id);
end $$;

create or replace function public.trg_credit_note_rollup()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    perform public.rollup_invoice_credited(old.invoice_id);
    return old;
  end if;
  perform public.rollup_invoice_credited(new.invoice_id);
  if tg_op = 'UPDATE' and old.invoice_id <> new.invoice_id then
    perform public.rollup_invoice_credited(old.invoice_id);
  end if;
  return new;
end $$;

drop trigger if exists credit_note_rollup on public.credit_note;
create trigger credit_note_rollup
after insert or update or delete on public.credit_note
for each row execute function public.trg_credit_note_rollup();

insert into public.document_sequence (code, prefix, format, padding, next_number, reset_yearly)
select 'credit_note', 'CN', '{PREFIX}-{YYYY}-{SEQ}', 5, 1, true
where not exists (select 1 from public.document_sequence where code = 'credit_note');
