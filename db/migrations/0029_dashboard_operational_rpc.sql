-- =====================================================================
-- 0029 · dashboard_operational() RPC — actionable dashboard metrics
--
-- Overdue / due-soon receivables, cash collected this month, orders awaiting
-- delivery & invoicing, open POs, low-stock count, plus overdue-invoice and
-- low-stock action lists. SECURITY DEFINER; authenticated-only.
-- =====================================================================
create or replace function public.dashboard_operational()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb; today date := current_date;
begin
  select jsonb_build_object(
    'overdue', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(balance),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft') and due_date < today),
    'due_soon', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(balance),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft') and due_date >= today and due_date <= today + 7),
    'collected_month', (select coalesce(sum(pa.amount_allocated),0)
      from payment p join payment_allocation pa on pa.payment_id = p.id
      where p.payment_date >= date_trunc('month', today)::date),
    'draft_quotations', (select count(*) from quotation where status = 'draft'),
    'awaiting_delivery', (select count(distinct so.id) from sales_order so
      join sales_order_line l on l.sales_order_id = so.id
      where so.status not in ('cancelled','closed') and l.quantity_ordered > l.quantity_delivered),
    'awaiting_invoice', (select count(distinct so.id) from sales_order so
      join sales_order_line l on l.sales_order_id = so.id
      where so.status not in ('cancelled','closed') and l.quantity_delivered > l.quantity_invoiced),
    'open_pos', (select count(*) from purchase_order where status = 'confirmed'),
    'low_stock', (select count(*) from (
        select p.reorder_point,
          coalesce((select sum(sm.quantity) from stock_move sm join location dl on dl.id=sm.dest_location_id where sm.product_id=p.id and dl.kind='stock'),0)
          - coalesce((select sum(sm.quantity) from stock_move sm join location sl on sl.id=sm.source_location_id where sm.product_id=p.id and sl.kind='stock'),0) as oh
        from product p where p.is_stockable and p.is_active
      ) s where s.reorder_point is not null and s.oh <= s.reorder_point),
    'overdue_list', (select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) from (
        select i.id, i.number, c.name as customer, i.due_date, i.balance
        from invoice i join customer c on c.id = i.customer_id
        where i.balance > 0.001 and i.status not in ('cancelled','draft') and i.due_date < today
        order by i.due_date asc limit 8) x),
    'low_stock_list', (select coalesce(jsonb_agg(row_to_json(z)),'[]'::jsonb) from (
        select y.sku, y.name, y.reorder_point, y.on_hand from (
          select p.sku, p.name, p.reorder_point,
            coalesce((select sum(sm.quantity) from stock_move sm join location dl on dl.id=sm.dest_location_id where sm.product_id=p.id and dl.kind='stock'),0)
            - coalesce((select sum(sm.quantity) from stock_move sm join location sl on sl.id=sm.source_location_id where sm.product_id=p.id and sl.kind='stock'),0) as on_hand
          from product p where p.is_stockable and p.is_active
        ) y where y.reorder_point is not null and y.on_hand <= y.reorder_point
        order by y.on_hand asc limit 8) z)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.dashboard_operational() from anon, public;
grant execute on function public.dashboard_operational() to authenticated;
