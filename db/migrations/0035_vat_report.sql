-- =====================================================================
-- 0035 · vat_report(from_date, to_date) — UAE VAT (FTA VAT201-style) summary
--
-- Output VAT (on sales) from invoices, Input VAT (on purchases) from purchase
-- orders, net VAT payable, a breakdown of output VAT by tax rate, and a
-- per-invoice detail listing. Honors the date range (null = all time).
-- Perm-gated (invoice.view); SECURITY DEFINER so it can read across scopes for
-- a finance/compliance report, exactly like reports_summary.
-- =====================================================================
create or replace function public.vat_report(from_date date default null, to_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not public.has_permission('invoice.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'from', from_date, 'to', to_date,
    -- Output VAT: what you charged customers
    'output', (
      select jsonb_build_object(
        'taxable', coalesce(sum(subtotal - discount_total), 0),
        'vat',     coalesce(sum(tax_total), 0),
        'count',   count(*))
      from invoice
      where status not in ('cancelled','draft')
        and (from_date is null or invoice_date >= from_date)
        and (to_date   is null or invoice_date <= to_date)),
    -- Input VAT: what you paid vendors (recoverable)
    'input', (
      select jsonb_build_object(
        'taxable', coalesce(sum(subtotal - discount_total), 0),
        'vat',     coalesce(sum(tax_total), 0),
        'count',   count(*))
      from purchase_order
      where status not in ('cancelled','draft')
        and (from_date is null or order_date >= from_date)
        and (to_date   is null or order_date <= to_date)),
    -- Output VAT split by tax rate (VAT201 boxes: standard 5% / zero / exempt)
    'by_rate', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select coalesce(tr.code, 'No tax')      as code,
               coalesce(tr.rate, 0)             as rate,
               coalesce(sum(il.line_subtotal - il.line_discount), 0) as taxable,
               coalesce(sum(il.line_tax), 0)    as vat
        from invoice_line il
        join invoice i on i.id = il.invoice_id
        left join tax_rate tr on tr.id = il.tax_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        group by tr.code, tr.rate
        order by coalesce(tr.rate, 0) desc
      ) x),
    -- Per-invoice detail (the backing list for the VAT return)
    'invoices', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select i.number,
               i.invoice_date,
               c.name as customer,
               (i.subtotal - i.discount_total) as taxable,
               i.tax_total as vat,
               i.total
        from invoice i
        join customer c on c.id = i.customer_id
        where i.status not in ('cancelled','draft')
          and (from_date is null or i.invoice_date >= from_date)
          and (to_date   is null or i.invoice_date <= to_date)
        order by i.invoice_date, i.number
        limit 1000
      ) x)
  ) into result;

  return result;
end $$;

revoke execute on function public.vat_report(date, date) from anon;
grant execute on function public.vat_report(date, date) to authenticated;
