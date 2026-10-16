-- 0055 · Multi-UoM fix: profit_report COGS must convert to BASE units.
-- cost_price is per base unit, so COGS = quantity × uom_factor × cost_price
-- (matching stock_move / stock_valuation). Without the factor, a sale of 2 Box
-- (factor 12) booked cost for 2 units instead of 24, hugely overstating margin.
-- by_product.qty is likewise reported in base units so mixed-unit sales don't
-- conflate pieces and boxes.
create or replace function public.profit_report(from_date date default null, to_date date default null, p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare result jsonb;
begin
  if not public.has_permission('inventory.product.view_cost') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    'totals', (
      select jsonb_build_object(
        'revenue', coalesce(sum(il.line_subtotal - il.line_discount), 0),
        'cost',    coalesce(sum(il.quantity * coalesce(il.uom_factor,1) * coalesce(p.cost_price, 0)), 0),
        'profit',  coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(il.uom_factor,1) * coalesce(p.cost_price, 0)), 0))
      from invoice_line il
      join invoice i on i.id = il.invoice_id
      left join product p on p.id = il.product_id
      where i.status not in ('cancelled','draft')
        and (from_date is null or i.invoice_date >= from_date)
        and (to_date   is null or i.invoice_date <= to_date)
        and (p_customer is null or i.customer_id = p_customer)),
    'by_product', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select coalesce(p.name, il.description) as name,
               coalesce(sum(il.quantity * coalesce(il.uom_factor,1)), 0) as qty,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as revenue,
               coalesce(sum(il.quantity * coalesce(il.uom_factor,1) * coalesce(p.cost_price, 0)), 0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(il.uom_factor,1) * coalesce(p.cost_price, 0)), 0) as profit
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        left join product p on p.id = il.product_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        group by coalesce(p.name, il.description)
        order by profit desc
        limit 20
      ) x),
    'by_customer', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select c.name as name,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as revenue,
               coalesce(sum(il.quantity * coalesce(il.uom_factor,1) * coalesce(p.cost_price, 0)), 0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(il.uom_factor,1) * coalesce(p.cost_price, 0)), 0) as profit
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        join customer c on c.id = i.customer_id
        left join product p on p.id = il.product_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        group by c.name
        order by profit desc
        limit 20
      ) x)
  ) into result;
  return result;
end $function$;

revoke execute on function public.profit_report(date, date, uuid) from public, anon;
grant  execute on function public.profit_report(date, date, uuid) to authenticated;
