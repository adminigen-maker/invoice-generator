-- =====================================================================
-- 0006 · Inventory — append-only stock moves + on-hand view
--
-- stock_move rows are NEVER updated or deleted. Corrections are
-- new offsetting rows. This makes audit trivial and lets you ask
-- "what did on-hand look like on 2026-07-03?" without lying.
-- =====================================================================

create table stock_move (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references product(id),
  uom_id uuid references unit_of_measure(id),
  quantity numeric(18,4) not null,           -- positive; direction is implied by source/dest
  source_location_id uuid references location(id),
  dest_location_id uuid references location(id),
  reference_type text,                        -- 'delivery_note', 'goods_receipt', 'adjustment'
  reference_id uuid,
  unit_cost numeric(18,4),                    -- captured at move time for valuation
  move_date timestamptz not null default now(),
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now()
);
create index on stock_move (product_id, move_date);
create index on stock_move (source_location_id);
create index on stock_move (dest_location_id);
create index on stock_move (reference_type, reference_id);

-- Guardrail: at least one of source/dest must be set, and they must differ.
alter table stock_move add constraint stock_move_endpoints
  check (
    (source_location_id is not null or dest_location_id is not null)
    and coalesce(source_location_id::text,'') <> coalesce(dest_location_id::text,'')
  );

-- Guardrail: append-only.
create or replace function stock_move_immutable() returns trigger as $$
begin
  raise exception 'stock_move is append-only — insert an offsetting row instead';
end;
$$ language plpgsql;
create trigger stock_move_no_update before update on stock_move
  for each row execute function stock_move_immutable();
create trigger stock_move_no_delete before delete on stock_move
  for each row execute function stock_move_immutable();

-- On-hand view: sum of (dest) minus (source) for each (product, location).
create or replace view stock_on_hand as
  select
    p.id           as product_id,
    l.id           as location_id,
    coalesce(sum(case when sm.dest_location_id   = l.id then  sm.quantity end), 0)
    - coalesce(sum(case when sm.source_location_id = l.id then  sm.quantity end), 0)
      as quantity_on_hand
  from product p
  cross join location l
  left join stock_move sm
    on sm.product_id = p.id
   and (sm.source_location_id = l.id or sm.dest_location_id = l.id)
  group by p.id, l.id;

-- ---------- Post-delivery hook ----------
-- When a delivery note's posted_at flips from NULL → set, emit stock moves
-- for every line: source = warehouse location, dest = customer virtual loc.
create or replace function post_delivery_note_moves() returns trigger as $$
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
    select dnl.*, so_l.description
      from delivery_note_line dnl
      join sales_order_line so_l on so_l.id = dnl.sales_order_line_id
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
      (ln.product_id, ln.uom_id, ln.quantity, ship_from, customer_loc,
       'delivery_note', new.id, now(), new.created_by, 'Auto: delivery ' || new.number);
  end loop;

  return new;
end;
$$ language plpgsql;

create trigger delivery_note_post_moves
  after update on delivery_note
  for each row execute function post_delivery_note_moves();
