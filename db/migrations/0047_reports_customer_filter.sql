-- =====================================================================
-- 0047 · Customer filter for the Reports page
--
-- reports_summary / vat_report / profit_report gain p_customer (null = all
-- customers). Filtering happens in SQL so every figure honours it. Input VAT
-- comes from purchase orders, which aren't attributable to a customer, so it is
-- reported as zero whenever a customer filter is active.
--
-- The old 2-arg signatures are dropped first so the 3-arg versions aren't
-- ambiguous when called with named arguments.
-- =====================================================================
drop function if exists public.reports_summary(date, date);
drop function if exists public.vat_report(date, date);
drop function if exists public.profit_report(date, date);

create or replace function public.reports_summary(from_date date default null, to_date date default null, p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare result jsonb; today date := current_date;
begin
  if not public.has_permission('invoice.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    'totals', (
      select jsonb_build_object('invoice_count', count(*), 'revenue', coalesce(sum(total),0),
        'collected', coalesce(sum(amount_paid),0), 'outstanding', coalesce(sum(balance),0))
      from invoice where status not in ('cancelled','draft')
        and (from_date is null or invoice_date >= from_date)
        and (to_date is null or invoice_date <= to_date)
        and (p_customer is null or customer_id = p_customer)),
    'ar_aging', (
      select jsonb_build_object(
        'not_due',  coalesce(sum(case when due_date >= today then balance else 0 end),0),
        'd1_30',    coalesce(sum(case when due_date < today and due_date >= today - 30 then balance else 0 end),0),
        'd31_60',   coalesce(sum(case when due_date < today - 30 and due_date >= today - 60 then balance else 0 end),0),
        'd60_plus', coalesce(sum(case when due_date < today - 60 then balance else 0 end),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft')
        and (p_customer is null or customer_id = p_customer)),
    'top_products', (
      select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select coalesce(pr.name, il.description) as name, sum(il.line_total) as revenue, sum(il.quantity) as qty
        from invoice_line il
        join invoice i on i.id = il.invoice_id and i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        left join product pr on pr.id = il.product_id
        group by coalesce(pr.name, il.description) order by sum(il.line_total) desc limit 8) x),
    'top_customers', (
      select coalesce(jsonb_agg(row_to_json(y)),'[]'::jsonb) from (
        select c.name, sum(i.total) as revenue, count(*) as invoices
        from invoice i join customer c on c.id = i.customer_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        group by c.name order by sum(i.total) desc limit 8) y),
    'revenue_by_month', (
      select coalesce(jsonb_agg(row_to_json(z) order by z.month),'[]'::jsonb) from (
        select to_char(date_trunc('month', invoice_date),'YYYY-MM') as month, sum(total) as revenue
        from invoice where status not in ('cancelled','draft')
          and invoice_date >= coalesce(from_date, today - interval '12 months')
          and (to_date is null or invoice_date <= to_date)
          and (p_customer is null or customer_id = p_customer)
        group by date_trunc('month', invoice_date)) z)
  ) into result;
  return result;
end $fn$;

create or replace function public.vat_report(from_date date default null, to_date date default null, p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare result jsonb;
begin
  if not public.has_permission('invoice.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    'output', (
      select jsonb_build_object(
        'taxable', coalesce(i.taxable,0) - coalesce(c.taxable,0),
        'vat',     coalesce(i.vat,0)     - coalesce(c.vat,0),
        'count',   coalesce(i.cnt,0))
      from (select sum(subtotal - discount_total) as taxable, sum(tax_total) as vat, count(*) as cnt
              from invoice where status not in ('cancelled','draft')
                and (from_date is null or invoice_date >= from_date)
                and (to_date is null or invoice_date <= to_date)
                and (p_customer is null or customer_id = p_customer)) i
      left join lateral (select sum(subtotal) as taxable, sum(tax_total) as vat
              from credit_note where status <> 'cancelled'
                and (from_date is null or credit_date >= from_date)
                and (to_date is null or credit_date <= to_date)
                and (p_customer is null or customer_id = p_customer)) c on true),
    'input', (
      case when p_customer is not null then jsonb_build_object('taxable',0,'vat',0,'count',0)
      else (select jsonb_build_object('taxable', coalesce(sum(subtotal - discount_total),0),
                   'vat', coalesce(sum(tax_total),0), 'count', count(*))
            from purchase_order where status not in ('cancelled','draft')
              and (from_date is null or order_date >= from_date)
              and (to_date is null or order_date <= to_date)) end),
    'by_rate', (
      select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select code, rate, sum(taxable) as taxable, sum(vat) as vat from (
          select coalesce(tr.code,'No tax') as code, coalesce(tr.rate,0) as rate,
                 coalesce(il.line_subtotal - il.line_discount,0) as taxable, coalesce(il.line_tax,0) as vat
            from invoice_line il join invoice i on i.id = il.invoice_id
            left join tax_rate tr on tr.id = il.tax_id
           where i.status not in ('cancelled','draft')
             and (from_date is null or i.invoice_date >= from_date)
             and (to_date is null or i.invoice_date <= to_date)
             and (p_customer is null or i.customer_id = p_customer)
          union all
          select coalesce(tr.code,'No tax'), coalesce(tr.rate,0),
                 -coalesce(cl.line_subtotal - cl.line_discount,0), -coalesce(cl.line_tax,0)
            from credit_note_line cl join credit_note cn on cn.id = cl.credit_note_id
            left join tax_rate tr on tr.id = cl.tax_id
           where cn.status <> 'cancelled'
             and (from_date is null or cn.credit_date >= from_date)
             and (to_date is null or cn.credit_date <= to_date)
             and (p_customer is null or cn.customer_id = p_customer)
        ) parts group by code, rate order by rate desc) x),
    'invoices', (
      select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select i.number, i.invoice_date, c.name as customer,
               (i.subtotal - i.discount_total) as taxable, i.tax_total as vat, i.total
        from invoice i join customer c on c.id = i.customer_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        order by i.invoice_date, i.number limit 1000) x)
  ) into result;
  return result;
end $fn$;

create or replace function public.profit_report(from_date date default null, to_date date default null, p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare result jsonb;
begin
  if not public.has_permission('inventory.product.view_cost') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    'totals', (
      select jsonb_build_object(
        'revenue', coalesce(sum(il.line_subtotal - il.line_discount),0),
        'cost',    coalesce(sum(il.quantity * coalesce(p.cost_price,0)),0),
        'profit',  coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price,0)),0))
      from invoice_line il join invoice i on i.id = il.invoice_id
      left join product p on p.id = il.product_id
      where i.status not in ('cancelled','draft')
        and (from_date is null or i.invoice_date >= from_date)
        and (to_date is null or i.invoice_date <= to_date)
        and (p_customer is null or i.customer_id = p_customer)),
    'by_product', (
      select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select coalesce(p.name, il.description) as name, coalesce(sum(il.quantity),0) as qty,
               coalesce(sum(il.line_subtotal - il.line_discount),0) as revenue,
               coalesce(sum(il.quantity * coalesce(p.cost_price,0)),0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price,0)),0) as profit
        from invoice_line il join invoice i on i.id = il.invoice_id
        left join product p on p.id = il.product_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        group by coalesce(p.name, il.description) order by profit desc limit 20) x),
    'by_customer', (
      select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select c.name as name,
               coalesce(sum(il.line_subtotal - il.line_discount),0) as revenue,
               coalesce(sum(il.quantity * coalesce(p.cost_price,0)),0) as cost,
               coalesce(sum((il.line_subtotal - il.line_discount) - il.quantity * coalesce(p.cost_price,0)),0) as profit
        from invoice_line il join invoice i on i.id = il.invoice_id
        join customer c on c.id = i.customer_id
        left join product p on p.id = il.product_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date is null or i.invoice_date <= to_date)
          and (p_customer is null or i.customer_id = p_customer)
        group by c.name order by profit desc limit 20) x)
  ) into result;
  return result;
end $fn$;

revoke execute on function public.reports_summary(date, date, uuid) from anon;
revoke execute on function public.vat_report(date, date, uuid) from anon;
revoke execute on function public.profit_report(date, date, uuid) from anon;
grant execute on function public.reports_summary(date, date, uuid) to authenticated;
grant execute on function public.vat_report(date, date, uuid) to authenticated;
grant execute on function public.profit_report(date, date, uuid) to authenticated;
