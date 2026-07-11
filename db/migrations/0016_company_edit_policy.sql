-- =====================================================================
-- 0016 · Allow admins to edit the company profile
--
-- company had only a SELECT policy; add an UPDATE policy gated by the
-- admin.company.edit permission so the Settings screen can save changes.
-- =====================================================================
drop policy if exists admin_write_company on public.company;
create policy admin_write_company on public.company for update to authenticated
  using (public.has_permission('admin.company.edit'))
  with check (public.has_permission('admin.company.edit'));
