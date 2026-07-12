-- =====================================================================
-- 0032 · Prevent double-counting stock between delivery notes and invoices
--
-- Both delivery notes and invoices are supported. Stock for a unit is issued
-- exactly once: an invoice now issues stock ONLY for lines that were NOT already
-- shipped via a delivery note (invoice_line.delivery_note_line_id IS NULL).
-- Lines billed from a posted delivery already had their stock issued there.
-- =====================================================================
create or replace function public.post_invoice_stock_moves() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    select il.product_id, il.uom_id, il.quantity
    from invoice_line il
    join product p on p.id = il.product_id
    where il.invoice_id = new.id
      and p.is_stockable = true
      and il.quantity > 0
      and il.delivery_note_line_id is null   -- not already shipped via a delivery note
  loop
    insert into stock_move (product_id, uom_id, quantity, source_location_id, dest_location_id,
                            reference_type, reference_id, move_date, created_by)
    values (ln.product_id, ln.uom_id, ln.quantity, ship_from, customer_loc,
            'invoice', new.id, current_date, new.created_by);
  end loop;

  return new;
end;
$$;
