-- =====================================================================
-- 0048 · Customer filter on the operational dashboard
--
-- Customer-scoped figures (receivables, collections, pipeline) honour
-- p_customer. Open POs and low stock are NOT customer-specific — they stay
-- company-wide, and the dashboard says so when a filter is active.
-- =====================================================================
drop function if exists public.dashboard_operational();

create or replace function public.dashboard_operational(p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare result jsonb; today date := current_date;
begin
  select jsonb_build_object(
    'overdue', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(balance),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft') and due_date < today
        and (p_customer is null or customer_id = p_customer)),
    'due_soon', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(balance),0))
      from invoice where balance > 0.001 and status not in ('cancelled','draft')
        and due_date >= today and due_date <= today + 7
        and (p_customer is null or customer_id = p_customer)),
    'collected_month', (select coalesce(sum(pa.amount_allocated),0)
      from payment p
      join payment_allocation pa on pa.payment_id = p.id
      join invoice inv on inv.id = pa.invoice_id
      where p.payment_date >= date_trunc('month', today)::date
        and (p_customer is null or inv.customer_id = p_customer)),
    'draft_quotations', (select count(*) from quotation
      where status = 'draft' and (p_customer is null or customer_id = p_customer)),
    'awaiting_delivery', (select count(distinct so.id) from sales_order so
      join sales_order_line l on l.sales_order_id = so.id
      where so.status not in ('cancelled','closed') and l.quantity_ordered > l.quantity_delivered
        and (p_customer is null or so.customer_id = p_customer)),
    'awaiting_invoice', (select count(distinct so.id) from sales_order so
      join sales_order_line l on l.sales_order_id = so.id
      where so.status not in ('cancelled','closed') and l.quantity_delivered > l.quantity_invoiced
        and (p_customer is null or so.customer_id = p_customer)),
    -- Not customer-specific: purchases and stock stay company-wide.
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
          and (p_customer is null or i.customer_id = p_customer)
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
end $fn$;

revoke execute on function public.dashboard_operational(uuid) from anon;
grant execute on function public.dashboard_operational(uuid) to authenticated;
