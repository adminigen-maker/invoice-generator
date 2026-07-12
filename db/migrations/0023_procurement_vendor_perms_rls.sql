-- =====================================================================
-- 0023 · Procurement module: vendor permissions + RLS
--
-- The vendor table had RLS enabled but NO policies (it was locked). Adds the
-- procurement.vendor.* permissions (granted to admin) and read/insert/update/
-- delete policies, mirroring the customer master.
-- =====================================================================
insert into public.app_permission (code, module, action, description) values
  ('procurement.vendor.view',   'procurement', 'view',   'View vendors'),
  ('procurement.vendor.create', 'procurement', 'create', 'Create vendors'),
  ('procurement.vendor.edit',   'procurement', 'edit',   'Edit vendors'),
  ('procurement.vendor.delete', 'procurement', 'delete', 'Delete vendors')
on conflict (code) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id from public.role r, public.app_permission p
where r.code = 'admin' and p.module = 'procurement'
on conflict (role_id, permission_id) do nothing;

drop policy if exists vendor_read on public.vendor;
create policy vendor_read on public.vendor for select to authenticated
  using (public.has_permission('procurement.vendor.view') and public.scope_allows(created_by, 'procurement'));

drop policy if exists vendor_insert on public.vendor;
create policy vendor_insert on public.vendor for insert to authenticated
  with check (public.has_permission('procurement.vendor.create'));

drop policy if exists vendor_update on public.vendor;
create policy vendor_update on public.vendor for update to authenticated
  using (public.has_permission('procurement.vendor.edit') and public.scope_allows(created_by, 'procurement'))
  with check (public.has_permission('procurement.vendor.edit'));

drop policy if exists vendor_delete on public.vendor;
create policy vendor_delete on public.vendor for delete to authenticated
  using (public.has_permission('procurement.vendor.delete') and public.scope_allows(created_by, 'procurement'));
