-- 0058 · Multi-UoM: customer_last_price returns the unit + factor of the last
-- line, so the "last price to customer" comparison can be done PER BASE UNIT
-- (a BOX price and a PCS price were being compared directly before). Only the
-- returned JSON changes vs 0042 (adds `factor` + `uom`); the query is otherwise
-- identical.
create or replace function public.customer_last_price(p_customer uuid, p_product uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  if not (public.has_permission('invoice.view') or public.has_permission('sales.quotation.view')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'price', il.unit_price,
    'factor', coalesce(il.uom_factor, 1),
    'uom', u.code,
    'date', i.invoice_date)
  into r
  from invoice_line il
  join invoice i on i.id = il.invoice_id
  left join unit_of_measure u on u.id = il.uom_id
  where i.customer_id = p_customer
    and il.product_id = p_product
    and i.status not in ('cancelled','draft')
  order by i.invoice_date desc, i.created_at desc
  limit 1;

  return r;
end $$;

revoke execute on function public.customer_last_price(uuid, uuid) from public, anon;
grant execute on function public.customer_last_price(uuid, uuid) to authenticated;
