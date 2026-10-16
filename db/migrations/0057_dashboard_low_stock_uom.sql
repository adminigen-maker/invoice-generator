-- 0057 · Multi-UoM: the dashboard "Low stock" widget shows the base unit.
-- Only change vs 0050: low_stock_list now selects the product's base uom code
-- (join unit_of_measure). Everything else is reproduced verbatim.
create or replace function public.dashboard_operational(p_customer uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare result jsonb; today date := current_date;
begin
  if not public.has_permission('invoice.view') then
    return jsonb_build_object(
      'overdue',  jsonb_build_object('count',0,'amount',0),
      'due_soon', jsonb_build_object('count',0,'amount',0),
      'collected_month', 0, 'draft_quotations', 0, 'awaiting_delivery', 0,
      'awaiting_invoice', 0, 'open_pos', 0, 'low_stock', 0,
      'overdue_list', '[]'::jsonb, 'low_stock_list', '[]'::jsonb);
  end if;
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
        select y.sku, y.name, y.uom, y.reorder_point, y.on_hand from (
          select p.sku, p.name, u.code as uom, p.reorder_point,
            coalesce((select sum(sm.quantity) from stock_move sm join location dl on dl.id=sm.dest_location_id where sm.product_id=p.id and dl.kind='stock'),0)
            - coalesce((select sum(sm.quantity) from stock_move sm join location sl on sl.id=sm.source_location_id where sm.product_id=p.id and sl.kind='stock'),0) as on_hand
          from product p
          left join unit_of_measure u on u.id = p.uom_id
          where p.is_stockable and p.is_active
        ) y where y.reorder_point is not null and y.on_hand <= y.reorder_point
        order by y.on_hand asc limit 8) z)
  ) into result;
  return result;
end $fn$;

revoke execute on function public.dashboard_operational(uuid) from public, anon;
grant  execute on function public.dashboard_operational(uuid) to authenticated;
