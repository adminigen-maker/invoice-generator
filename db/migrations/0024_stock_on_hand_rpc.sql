-- =====================================================================
-- 0024 · stock_on_hand() RPC for the Inventory screen
--
-- Per-product on hand = quantity moved INTO 'stock' locations minus quantity
-- moved OUT of them. SECURITY DEFINER, gated by inventory.stock.view; cost/value
-- only included when the caller holds inventory.product.view_cost.
-- =====================================================================
create or replace function public.stock_on_hand()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb; show_cost boolean;
begin
  if not public.has_permission('inventory.stock.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  show_cost := public.has_permission('inventory.product.view_cost');

  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb) into result
  from (
    select
      p.id as product_id, p.sku, p.name, u.code as uom,
      (
        coalesce((select sum(sm.quantity) from stock_move sm
                    join location dl on dl.id = sm.dest_location_id
                  where sm.product_id = p.id and dl.kind = 'stock'), 0)
        - coalesce((select sum(sm.quantity) from stock_move sm
                    join location sl on sl.id = sm.source_location_id
                   where sm.product_id = p.id and sl.kind = 'stock'), 0)
      ) as on_hand,
      p.reorder_point,
      case when show_cost then p.cost_price else null end as cost_price
    from product p
    left join unit_of_measure u on u.id = p.uom_id
    where p.is_stockable = true and p.is_active = true
  ) t;

  return result;
end;
$$;

revoke execute on function public.stock_on_hand() from anon, public;
grant execute on function public.stock_on_hand() to authenticated;
