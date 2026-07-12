-- =====================================================================
-- 0034 · Make reference/lookup tables editable
--
-- Adds write RLS (gated by admin.company.edit) for unit_of_measure, tax_rate and
-- warehouse (they previously had read-only policies), powering the new
-- Settings → Reference data admin. Also backfills a created_at on
-- unit_of_measure, which lacked one.
-- =====================================================================
alter table public.unit_of_measure add column if not exists created_at timestamptz not null default now();

drop policy if exists uom_insert on public.unit_of_measure;
create policy uom_insert on public.unit_of_measure for insert to authenticated
  with check (public.has_permission('admin.company.edit'));
drop policy if exists uom_update on public.unit_of_measure;
create policy uom_update on public.unit_of_measure for update to authenticated
  using (public.has_permission('admin.company.edit')) with check (public.has_permission('admin.company.edit'));
drop policy if exists uom_delete on public.unit_of_measure;
create policy uom_delete on public.unit_of_measure for delete to authenticated
  using (public.has_permission('admin.company.edit'));

drop policy if exists tax_insert on public.tax_rate;
create policy tax_insert on public.tax_rate for insert to authenticated
  with check (public.has_permission('admin.company.edit'));
drop policy if exists tax_update on public.tax_rate;
create policy tax_update on public.tax_rate for update to authenticated
  using (public.has_permission('admin.company.edit')) with check (public.has_permission('admin.company.edit'));
drop policy if exists tax_delete on public.tax_rate;
create policy tax_delete on public.tax_rate for delete to authenticated
  using (public.has_permission('admin.company.edit'));

drop policy if exists warehouse_insert on public.warehouse;
create policy warehouse_insert on public.warehouse for insert to authenticated
  with check (public.has_permission('admin.company.edit'));
drop policy if exists warehouse_update on public.warehouse;
create policy warehouse_update on public.warehouse for update to authenticated
  using (public.has_permission('admin.company.edit')) with check (public.has_permission('admin.company.edit'));
drop policy if exists warehouse_delete on public.warehouse;
create policy warehouse_delete on public.warehouse for delete to authenticated
  using (public.has_permission('admin.company.edit'));
