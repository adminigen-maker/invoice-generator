-- =====================================================================
-- 0030 · reports_summary(from_date, to_date) — date-range filter
--
-- Replaces the no-arg reports_summary() with a parameterized version. AR aging
-- stays "as of today"; totals / top lists / revenue trend honor the range
-- (null = all time, or last 12 months for the trend).
-- =====================================================================
drop function if exists public.reports_summary();

create or replace function public.reports_summary(from_date date default null, to_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb; today date := current_date;
begin
  if not public.has_permission('invoice.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    'totals', (
      select jsonb_build_object(
        'invoice_count', count(*), 'revenue', coalesce(sum(total),0),
        'collected', coalesce(sum(amount_paid),0), 'outstanding', coalesce(sum(balance),0))
      from invoice
      where status not in ('cancelled','draft')
        and (from_date is null or invoice_date >= from_date)
        and (to_date   is null or invoice_date <= to_date)),
    'ar_aging', (
      select jsonb_build_object(
        'not_due',  coalesce(sum(case when due_date >= today then balance else 0 end),0),
        'd1_30',    coalesce(sum(case when due_date < today and due_date >= today - 30 then balance else 0 end),0),
        'd31_60',   coalesce(sum(case when due_date < today - 30 and due_date >= today - 60 then balance else 0 end),0),
        'd60_plus', coalesce(sum(case when due_date < today - 60 then balance else 0 end),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft')),
    'top_products', (
      select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select coalesce(pr.name, il.description) as name, sum(il.line_total) as revenue, sum(il.quantity) as qty
        from invoice_line il
        join invoice i on i.id = il.invoice_id and i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        left join product pr on pr.id = il.product_id
        group by coalesce(pr.name, il.description) order by sum(il.line_total) desc limit 8) x),
    'top_customers', (
      select coalesce(jsonb_agg(row_to_json(y)),'[]'::jsonb) from (
        select c.name, sum(i.total) as revenue, count(*) as invoices
        from invoice i join customer c on c.id = i.customer_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        group by c.name order by sum(i.total) desc limit 8) y),
    'revenue_by_month', (
      select coalesce(jsonb_agg(row_to_json(z) order by z.month),'[]'::jsonb) from (
        select to_char(date_trunc('month', invoice_date),'YYYY-MM') as month, sum(total) as revenue
        from invoice
        where status not in ('cancelled','draft')
          and invoice_date >= coalesce(from_date, today - interval '12 months')
          and (to_date is null or invoice_date <= to_date)
        group by date_trunc('month', invoice_date)) z)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.reports_summary(date, date) from anon, public;
grant execute on function public.reports_summary(date, date) to authenticated;
