-- =====================================================================
-- 0044 · VAT report nets off credit notes (customer returns)
--
-- A return reverses output VAT, so credit notes must be subtracted from sales
-- VAT — otherwise the VAT return overstates what's owed. Output totals and the
-- by-rate breakdown both net credits.
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
    'output', (
      select jsonb_build_object(
        'taxable', coalesce(i.taxable, 0) - coalesce(c.taxable, 0),
        'vat',     coalesce(i.vat, 0)     - coalesce(c.vat, 0),
        'count',   coalesce(i.cnt, 0))
      from
        (select sum(subtotal - discount_total) as taxable, sum(tax_total) as vat, count(*) as cnt
           from invoice
          where status not in ('cancelled','draft')
            and (from_date is null or invoice_date >= from_date)
            and (to_date   is null or invoice_date <= to_date)) i
        left join lateral (
          select sum(subtotal) as taxable, sum(tax_total) as vat
            from credit_note
           where status <> 'cancelled'
             and (from_date is null or credit_date >= from_date)
             and (to_date   is null or credit_date <= to_date)) c on true),
    'input', (
      select jsonb_build_object(
        'taxable', coalesce(sum(subtotal - discount_total), 0),
        'vat',     coalesce(sum(tax_total), 0),
        'count',   count(*))
      from purchase_order
      where status not in ('cancelled','draft')
        and (from_date is null or order_date >= from_date)
        and (to_date   is null or order_date <= to_date)),
    'by_rate', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select code, rate, sum(taxable) as taxable, sum(vat) as vat
        from (
          select coalesce(tr.code, 'No tax') as code, coalesce(tr.rate, 0) as rate,
                 coalesce(il.line_subtotal - il.line_discount, 0) as taxable,
                 coalesce(il.line_tax, 0) as vat
            from invoice_line il
            join invoice i on i.id = il.invoice_id
            left join tax_rate tr on tr.id = il.tax_id
           where i.status not in ('cancelled','draft')
             and (from_date is null or i.invoice_date >= from_date)
             and (to_date   is null or i.invoice_date <= to_date)
          union all
          select coalesce(tr.code, 'No tax'), coalesce(tr.rate, 0),
                 -coalesce(cl.line_subtotal - cl.line_discount, 0),
                 -coalesce(cl.line_tax, 0)
            from credit_note_line cl
            join credit_note cn on cn.id = cl.credit_note_id
            left join tax_rate tr on tr.id = cl.tax_id
           where cn.status <> 'cancelled'
             and (from_date is null or cn.credit_date >= from_date)
             and (to_date   is null or cn.credit_date <= to_date)
        ) parts
        group by code, rate
        order by rate desc
      ) x),
    'invoices', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
        select i.number, i.invoice_date, c.name as customer,
               (i.subtotal - i.discount_total) as taxable, i.tax_total as vat, i.total
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
