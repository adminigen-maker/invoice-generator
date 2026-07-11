-- =====================================================================
-- 0014 · Allow admins to edit document numbering
--
-- document_sequence had only a SELECT policy, so the Settings UI could show
-- the sequences but not save changes. Add an UPDATE policy gated by the
-- admin.sequence.edit permission.
-- =====================================================================

drop policy if exists admin_write_sequence on public.document_sequence;
create policy admin_write_sequence on public.document_sequence for update to authenticated
  using (public.has_permission('admin.sequence.edit'))
  with check (public.has_permission('admin.sequence.edit'));
