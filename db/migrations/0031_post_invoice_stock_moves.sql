-- =====================================================================
-- 0031 · Invoice-only stock issue
--
-- Posting an invoice (posted_at NULL -> set) now issues stock for each stockable
-- line (warehouse 'stock' location -> 'customer' location), so on-hand drops
-- without a delivery note. Delivery notes remain available but are optional in
-- this mode — do NOT also post a delivery note for the same goods or stock will
-- be deducted twice.
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
    where il.invoice_id = new.id and p.is_stockable = true and il.quantity > 0
  loop
    insert into stock_move (product_id, uom_id, quantity, source_location_id, dest_location_id,
                            reference_type, reference_id, move_date, created_by)
    values (ln.product_id, ln.uom_id, ln.quantity, ship_from, customer_loc,
            'invoice', new.id, current_date, new.created_by);
  end loop;

  return new;
end;
$$;

drop trigger if exists post_invoice_stock_moves on public.invoice;
create trigger post_invoice_stock_moves after update on public.invoice
  for each row execute function public.post_invoice_stock_moves();
