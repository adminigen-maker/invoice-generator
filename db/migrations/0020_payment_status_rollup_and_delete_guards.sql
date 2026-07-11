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
