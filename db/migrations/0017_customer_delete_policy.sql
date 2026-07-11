-- =====================================================================
-- 0017 · Allow deleting customers (gated by sales.customer.delete)
--
-- customer had insert/update/select policies but no DELETE policy, so the
-- new row "Delete" action was blocked. product already has a delete policy.
-- =====================================================================
drop policy if exists customer_delete on public.customer;
create policy customer_delete on public.customer for delete to authenticated
  using (public.has_permission('sales.customer.delete') and public.scope_allows(created_by, 'sales'));
