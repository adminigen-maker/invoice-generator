-- =====================================================================
-- 0042 · customer_last_price(customer, product)
--
-- The most recent price THIS customer was invoiced for a product (ignores
-- draft/cancelled invoices). Used on the quotation / invoice line editors to
-- show the customer's previous price and warn when the new price is higher.
-- =====================================================================
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

  select jsonb_build_object('price', il.unit_price, 'date', i.invoice_date)
  into r
  from invoice_line il
  join invoice i on i.id = il.invoice_id
  where i.customer_id = p_customer
    and il.product_id = p_product
    and i.status not in ('cancelled','draft')
  order by i.invoice_date desc, i.created_at desc
  limit 1;

  return r;
end $$;

revoke execute on function public.customer_last_price(uuid, uuid) from anon;
grant execute on function public.customer_last_price(uuid, uuid) to authenticated;
