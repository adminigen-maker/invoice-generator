-- 0054 · Multi-UoM Phase 3: delivery-note goods issue converts to base units.
-- Same rule as the invoice trigger: move quantity × uom_factor in the product's
-- base unit. Joins product for the base uom (null-product lines can't move stock
-- and are skipped, which the original insert couldn't do anyway). Default 1 =
-- existing deliveries unchanged.
create or replace function public.post_delivery_note_moves()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$
declare
  ln record;
  customer_loc uuid;
  ship_from uuid;
begin
  if new.posted_at is null or old.posted_at is not null then
    return new;
  end if;

  select id into customer_loc from location where kind = 'customer' limit 1;
  if customer_loc is null then
    raise exception 'No virtual customer location configured — seed one before posting deliveries';
  end if;

  for ln in
    select dnl.*, p.uom_id as base_uom
      from delivery_note_line dnl
      join sales_order_line so_l on so_l.id = dnl.sales_order_line_id
      join product p on p.id = dnl.product_id
     where dnl.delivery_note_id = new.id
  loop
    ship_from := coalesce(
      ln.source_location_id,
      (select id from location where warehouse_id = new.warehouse_id and kind = 'stock' limit 1)
    );
    if ship_from is null then
      raise exception 'No source stock location resolved for delivery %', new.number;
    end if;

    insert into stock_move
      (product_id, uom_id, quantity, source_location_id, dest_location_id,
       reference_type, reference_id, move_date, created_by, notes)
    values
      (ln.product_id, ln.base_uom, ln.quantity * coalesce(ln.uom_factor, 1), ship_from, customer_loc,
       'delivery_note', new.id, now(), new.created_by, 'Auto: delivery ' || new.number);
  end loop;

  return new;
end;
$function$;
