-- =====================================================================
-- 0038 · adjust_stock(product, new_qty, reason)
--
-- Manual stock adjustment / opening balance. You pass the ACTUAL on-hand
-- quantity you want the product to have; the function computes the delta vs
-- current on-hand and writes a single reconciling stock_move between the
-- 'stock' and 'adjustment' virtual locations. Gated on inventory.stock.adjust.
-- =====================================================================
create or replace function public.adjust_stock(p_product_id uuid, p_new_qty numeric, p_reason text default null)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock_loc uuid;
  v_adj_loc   uuid;
  v_uom       uuid;
  v_cost      numeric;
  v_current   numeric;
  v_delta     numeric;
begin
  if not public.has_permission('inventory.stock.adjust') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select uom_id, cost_price into v_uom, v_cost from product where id = p_product_id;
  if not found then
    raise exception 'product not found' using errcode = '22023';
  end if;

  select id into v_stock_loc from location where kind = 'stock'      and is_active order by code limit 1;
  select id into v_adj_loc   from location where kind = 'adjustment' and is_active order by code limit 1;
  if v_stock_loc is null or v_adj_loc is null then
    raise exception 'stock or adjustment location is not configured' using errcode = '22023';
  end if;

  select
      coalesce((select sum(quantity) from stock_move sm join location dl on dl.id = sm.dest_location_id
                where sm.product_id = p_product_id and dl.kind = 'stock'), 0)
    - coalesce((select sum(quantity) from stock_move sm join location sl on sl.id = sm.source_location_id
                where sm.product_id = p_product_id and sl.kind = 'stock'), 0)
  into v_current;

  v_delta := p_new_qty - v_current;
  if v_delta = 0 then
    return v_current;
  end if;

  if v_delta > 0 then
    insert into stock_move (product_id, uom_id, quantity, source_location_id, dest_location_id, reference_type, unit_cost, notes, created_by)
    values (p_product_id, v_uom, v_delta, v_adj_loc, v_stock_loc, 'adjustment', v_cost, p_reason, (select id from app_user where id = auth.uid()));
  else
    insert into stock_move (product_id, uom_id, quantity, source_location_id, dest_location_id, reference_type, unit_cost, notes, created_by)
    values (p_product_id, v_uom, -v_delta, v_stock_loc, v_adj_loc, 'adjustment', v_cost, p_reason, (select id from app_user where id = auth.uid()));
  end if;

  return p_new_qty;
end $$;

revoke execute on function public.adjust_stock(uuid, numeric, text) from anon, public;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;
