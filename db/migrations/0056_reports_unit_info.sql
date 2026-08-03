-- 0056 · Multi-UoM Part B: show the base unit + base-unit quantity in the
-- sales/profit "by product" reports.
--   • reports_summary.top_products: qty now in BASE units (× uom_factor) and a
--     `uom` (base unit code) is added.
--   • profit_report.by_product: a `uom` (base unit code) is added (qty was
--     already converted to base units in 0055).
-- Both are otherwise unchanged from their prior definitions.

create or replace function public.reports_summary(from_date date default null, to_date date default null, p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare result jsonb; today date := current_date;
begin
  if not public.has_permission('invoice.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    'totals', (
      select jsonb_build_object(
        'invoice_count', count(*),
        'revenue', coalesce(sum(total), 0),
        'collected', coalesce(sum(amount_paid), 0),
        'outstanding', coalesce(sum(balance), 0))
      from invoice
      where status not in ('cancelled', 'draft')
        and (from_date is null or invoice_date >= from_date)
        and (to_date   is null or invoice_date <= to_date)
        and (p_customer is null or customer_id = p_customer)),
    'ar_aging', (
      select jsonb_build_object(
        'not_due',  coalesce(sum(case when due_date >= today then balance else 0 end), 0),
        'd1_30',    coalesce(sum(case when due_date < today and due_date >= today - 30 then balance else 0 end), 0),
        'd31_60',   coalesce(sum(case when due_date < today - 30 and due_date >= today - 60 then balance else 0 end), 0),
        'd60_plus', coalesce(sum(case when due_date < today - 60 then balance else 0 end), 0))
      from invoice
      where balance > 0.001 and status not in ('cancelled', 'draft')
        and (p_customer is null or customer_id = p_customer)),
    'top_products', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select coalesce(pr.name, il.description) as name,
               max(uu.code) as uom,
               sum(il.line_total) as revenue,
               sum(il.quantity * coalesce(il.uom_factor, 1)) as qty
        from invoice_line il
        join invoice i on i.id = il.invoice_id and i.status not in ('cancelled', 'draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        left join product pr on pr.id = il.product_id
        left join unit_of_measure uu on uu.id = pr.uom_id
        group by coalesce(pr.name, il.description) order by sum(il.line_total) desc limit 8) x),
    'top_customers', (
      select coalesce(jsonb_agg(row_to_json(y)), '[]'::jsonb) from (
        select c.name, sum(i.total) as revenue, count(*) as invoices
        from invoice i join customer c on c.id = i.customer_id
        where i.status not in ('cancelled', 'draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        group by c.name order by sum(i.total) desc limit 8) y),
    'revenue_by_month', (
      select coalesce(jsonb_agg(row_to_json(z) order by z.month), '[]'::jsonb) from (
        select to_char(date_trunc('month', invoice_date), 'YYYY-MM') as month, sum(total) as revenue
        from invoice
        where status not in ('cancelled', 'draft')
          and invoice_date >= coalesce(from_date, today - interval '12 months')
          and (to_date is null or invoice_date <= to_date)
          and (p_customer is null or customer_id = p_customer)
        group by date_trunc('month', invoice_date)) z)
  ) into result;
  return result;
end $function$;

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
               max(u.code) as uom,
               coalesce(sum(il.quantity * coalesce(il.uom_factor,1)), 0) as qty,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as revenue,
               coalesce(sum(il.quantity * coalesce(il.uom_factor,1) * coalesce(p.cost_price, 0)), 0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(il.uom_factor,1) * coalesce(p.cost_price, 0)), 0) as profit
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        left join product p on p.id = il.product_id
        left join unit_of_measure u on u.id = p.uom_id
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

revoke execute on function public.reports_summary(date, date, uuid) from public, anon;
grant  execute on function public.reports_summary(date, date, uuid) to authenticated;
revoke execute on function public.profit_report(date, date, uuid) from public, anon;
grant  execute on function public.profit_report(date, date, uuid) to authenticated;
