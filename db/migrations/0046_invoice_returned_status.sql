-- =====================================================================
-- 0046 · Fully-credited invoices become 'returned'
--
-- If the customer sent everything back (credited_total covers the whole
-- invoice), the invoice isn't "paid" — it's returned. Checked before the paid
-- case so a full return wins.
-- =====================================================================
create or replace function public.recompute_invoice_status(inv_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare paid numeric; credited numeric; tot numeric; cur text;
begin
  select amount_paid, credited_total, total, status::text
    into paid, credited, tot, cur
  from invoice where id = inv_id;
  if cur is not null and cur not in ('draft','cancelled','closed') then
    update invoice set status = (case
        when tot > 0 and coalesce(credited,0) >= tot - 0.001 then 'returned'
        when tot > 0 and (coalesce(paid,0) + coalesce(credited,0)) >= tot - 0.001 then 'paid'
        when coalesce(paid,0) > 0 then 'partially_paid'
        else 'invoiced'
      end)::doc_status
    where id = inv_id;
  end if;
end $$;
