-- =====================================================================
-- 0036 · stock_valuation() + profit_report(from,to)
--
-- Both expose COST data, so both are gated on inventory.product.view_cost
-- (the same permission that unmasks cost_price / margin elsewhere), NOT just
-- invoice.view. SECURITY DEFINER so the figures aggregate across scopes.
--
-- Valuation uses standard cost (product.cost_price) — the maintained cost on
-- the product card. COGS in the profit report likewise uses the product's
-- current cost_price (there is no cost-at-sale column captured on the line),
-- so profit is an approximation based on today's costs.
-- =====================================================================

-- ---- Stock valuation: on-hand × cost, per stockable product ----------
create or replace function public.stock_valuation()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not public.has_permission('inventory.product.view_cost') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'items',       coalesce(jsonb_agg(row_to_json(t) order by t.value desc), '[]'::jsonb),
    'total_value', coalesce(sum(t.value), 0),
    'total_lines', count(*)
  ) into result
  from (
    select sku, name, category, uom, on_hand, cost, (on_hand * cost) as value
    from (
      select p.sku, p.name,
             coalesce(c.name, '—') as category,
             u.code as uom,
             p.cost_price as cost,
             (
               coalesce((select sum(sm.quantity) from stock_move sm
                           join location dl on dl.id = sm.dest_location_id
                         where sm.product_id = p.id and dl.kind = 'stock'), 0)
               - coalesce((select sum(sm.quantity) from stock_move sm
                           join location sl on sl.id = sm.source_location_id
                          where sm.product_id = p.id and sl.kind = 'stock'), 0)
             ) as on_hand
      from product p
      left join unit_of_measure u on u.id = p.uom_id
      left join product_category c on c.id = p.category_id
      where p.is_stockable = true and p.is_active = true
    ) q
    where q.on_hand <> 0
  ) t;

  return result;
end $$;

revoke execute on function public.stock_valuation() from anon, public;
grant execute on function public.stock_valuation() to authenticated;

-- ---- Profit / gross margin: revenue - COGS -------------------------------
create or replace function public.profit_report(from_date date default null, to_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
        'cost',    coalesce(sum(il.quantity * coalesce(p.cost_price, 0)), 0),
        'profit',  coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price, 0)), 0))
      from invoice_line il
      join invoice i on i.id = il.invoice_id
      left join product p on p.id = il.product_id
      where i.status not in ('cancelled','draft')
        and (from_date is null or i.invoice_date >= from_date)
        and (to_date   is null or i.invoice_date <= to_date)),
    'by_product', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select coalesce(p.name, il.description) as name,
               coalesce(sum(il.quantity), 0) as qty,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as revenue,
               coalesce(sum(il.quantity * coalesce(p.cost_price, 0)), 0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price, 0)), 0) as profit
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        left join product p on p.id = il.product_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        group by coalesce(p.name, il.description)
        order by profit desc
        limit 20
      ) x),
    'by_customer', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select c.name as name,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as revenue,
               coalesce(sum(il.quantity * coalesce(p.cost_price, 0)), 0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price, 0)), 0) as profit
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        join customer c on c.id = i.customer_id
        left join product p on p.id = il.product_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        group by c.name
        order by profit desc
        limit 20
      ) x)
  ) into result;

  return result;
end $$;

revoke execute on function public.profit_report(date, date) from anon, public;
grant execute on function public.profit_report(date, date) to authenticated;
