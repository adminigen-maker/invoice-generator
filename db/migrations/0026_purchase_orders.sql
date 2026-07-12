-- =====================================================================
-- 0026 · Purchase Orders (procurement)
--
-- Vendor-facing counterpart of the sales order: draft → confirmed → received.
-- Receiving posts stock IN (vendor location → warehouse stock location) via the
-- server action. Includes tables, numbering sequence, permissions and RLS.
-- =====================================================================
create table if not exists public.purchase_order (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  vendor_id uuid not null references public.vendor(id),
  order_date date not null default current_date,
  expected_date date,
  warehouse_id uuid references public.warehouse(id),
  currency text not null default 'AED',
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  status public.doc_status not null default 'draft',
  notes text,
  received_at timestamptz,
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_purchase_order_vendor_id on public.purchase_order (vendor_id);
drop trigger if exists purchase_order_updated on public.purchase_order;
create trigger purchase_order_updated before update on public.purchase_order
  for each row execute function public.set_updated_at();

create table if not exists public.purchase_order_line (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_order(id) on delete cascade,
  sequence int not null default 0,
  product_id uuid references public.product(id),
  description text not null,
  quantity numeric(18,3) not null default 1,
  quantity_received numeric(18,3) not null default 0,
  uom_id uuid references public.unit_of_measure(id),
  unit_price numeric(18,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  tax_id uuid references public.tax_rate(id),
  line_subtotal numeric(18,2) not null default 0,
  line_discount numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0
);
create index if not exists idx_purchase_order_line_po on public.purchase_order_line (purchase_order_id);

insert into public.document_sequence (code, prefix, format, padding, next_number, reset_yearly)
select 'purchase_order', 'PO', '{PREFIX}-{YYYY}-{SEQ}', 5, 1, true
where not exists (select 1 from public.document_sequence where code = 'purchase_order');

insert into public.app_permission (code, module, action, description) values
  ('procurement.po.view',    'procurement', 'view',    'View purchase orders'),
  ('procurement.po.create',  'procurement', 'create',  'Create purchase orders'),
  ('procurement.po.edit',    'procurement', 'edit',    'Edit purchase orders'),
  ('procurement.po.confirm', 'procurement', 'approve', 'Confirm purchase orders'),
  ('procurement.po.receive', 'procurement', 'approve', 'Receive purchase orders into stock'),
  ('procurement.po.cancel',  'procurement', 'approve', 'Cancel purchase orders'),
  ('procurement.po.delete',  'procurement', 'delete',  'Delete purchase orders')
on conflict (code) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r, public.app_permission p
where r.code = 'admin' and p.module = 'procurement'
on conflict (role_id, permission_id) do nothing;

alter table public.purchase_order enable row level security;
alter table public.purchase_order_line enable row level security;

drop policy if exists po_read on public.purchase_order;
create policy po_read on public.purchase_order for select to authenticated
  using (public.has_permission('procurement.po.view') and public.scope_allows(created_by, 'procurement'));
drop policy if exists po_insert on public.purchase_order;
create policy po_insert on public.purchase_order for insert to authenticated
  with check (public.has_permission('procurement.po.create'));
drop policy if exists po_update on public.purchase_order;
create policy po_update on public.purchase_order for update to authenticated
  using (public.has_permission('procurement.po.edit') and public.scope_allows(created_by, 'procurement'))
  with check (public.has_permission('procurement.po.edit'));
drop policy if exists po_delete on public.purchase_order;
create policy po_delete on public.purchase_order for delete to authenticated
  using (public.has_permission('procurement.po.delete') and public.scope_allows(created_by, 'procurement'));

drop policy if exists po_line_all on public.purchase_order_line;
create policy po_line_all on public.purchase_order_line for all to authenticated
  using (exists (select 1 from public.purchase_order po where po.id = purchase_order_id
                   and public.has_permission('procurement.po.view')
                   and public.scope_allows(po.created_by, 'procurement')))
  with check (exists (select 1 from public.purchase_order po where po.id = purchase_order_id
                        and public.has_permission('procurement.po.edit')));
