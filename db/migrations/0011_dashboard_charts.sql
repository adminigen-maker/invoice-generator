-- =====================================================================
-- 0011 · Dashboard chart aggregates
--
-- Small, RLS-scoped (SECURITY INVOKER) aggregates so the dashboard can
-- render charts from one round trip each instead of pulling raw rows.
-- =====================================================================

-- Invoice count grouped by status (for the status donut).
create or replace function public.invoice_status_counts()
returns table (status text, count bigint)
language sql stable security invoker set search_path = ''
as $$
  select i.status::text, count(*)::bigint
  from public.invoice i
  group by i.status
  order by count(*) desc;
$$;
grant execute on function public.invoice_status_counts() to authenticated;

-- Invoiced vs collected per month, last `months` months (for the trend area).
create or replace function public.revenue_by_month(months int default 6)
returns table (month text, invoiced numeric, collected numeric)
language sql stable security invoker set search_path = ''
as $$
  select
    to_char(m.d, 'Mon') as month,
    coalesce(sum(i.total), 0)::numeric      as invoiced,
    coalesce(sum(i.amount_paid), 0)::numeric as collected
  from (
    select generate_series(
      date_trunc('month', current_date) - make_interval(months => greatest(months, 1) - 1),
      date_trunc('month', current_date),
      interval '1 month'
    ) as d
  ) m
  left join public.invoice i on date_trunc('month', i.invoice_date) = m.d
  group by m.d
  order by m.d;
$$;
grant execute on function public.revenue_by_month(int) to authenticated;

-- Top customers by invoiced total (for the ranking bar).
create or replace function public.top_customers(lim int default 5)
returns table (name text, total numeric)
language sql stable security invoker set search_path = ''
as $$
  select c.name, coalesce(sum(i.total), 0)::numeric as total
  from public.invoice i
  join public.customer c on c.id = i.customer_id
  group by c.name
  order by total desc
  limit greatest(lim, 1);
$$;
grant execute on function public.top_customers(int) to authenticated;
