-- 0053 · Multi-UoM Phase 2: invoice stock posting converts to base units.
--
-- A line sold in a non-base unit (e.g. 2 Box, factor 12) must move 24 BASE units
-- of stock. stock_on_hand/valuation sum stock_move.quantity per product IGNORING
-- uom_id, so every move must be in the product's base unit. We multiply by the
-- line's frozen uom_factor and stamp the product's base uom_id. uom_factor
-- defaults to 1, so existing invoices are unaffected.
create or replace function public.post_invoice_stock_moves()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
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
  select id into ship_from   from location where kind = 'stock'    limit 1;
  if customer_loc is null or ship_from is null then
    return new;
  end if;

  for ln in
    select il.product_id,
           p.uom_id as base_uom,
           (il.quantity * coalesce(il.uom_factor, 1)) as base_qty
    from invoice_line il
    join product p on p.id = il.product_id
    where il.invoice_id = new.id
      and p.is_stockable = true
      and il.quantity > 0
      and il.delivery_note_line_id is null   -- not already shipped via a delivery note
  loop
    insert into stock_move (product_id, uom_id, quantity, source_location_id, dest_location_id,
                            reference_type, reference_id, move_date, created_by)
    values (ln.product_id, ln.base_uom, ln.base_qty, ship_from, customer_loc,
            'invoice', new.id, current_date, new.created_by);
  end loop;

  return new;
end;
$function$;
