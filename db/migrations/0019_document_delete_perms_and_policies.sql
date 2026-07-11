-- =====================================================================
-- 0019 · Delete permissions + RLS policies for document tables
--
-- The new row "Delete" action needs a delete permission and a matching RLS
-- DELETE policy per table. quotation (sales.quotation.delete) and invoice
-- (invoice.void) already had both; sales_order, delivery_note and payment did
-- not, so their deletes were blocked. Cancel reuses each module's existing
-- *.edit permission (matching the existing UPDATE policies).
-- =====================================================================
insert into public.app_permission (code, module, action, description) values
  ('sales.order.delete',       'sales',     'delete', 'Delete draft/cancelled sales orders'),
  ('inventory.delivery.delete','inventory', 'delete', 'Delete draft/cancelled delivery notes'),
  ('invoice.payment.delete',   'invoice',   'delete', 'Delete payments (restores invoice balance)')
on conflict (code) do nothing;

insert into public.role_permission (role_id, permission_id)
select r.id, p.id
from public.role r, public.app_permission p
where r.code = 'admin'
  and p.code in ('sales.order.delete','inventory.delivery.delete','invoice.payment.delete')
on conflict (role_id, permission_id) do nothing;

drop policy if exists sales_order_delete on public.sales_order;
create policy sales_order_delete on public.sales_order for delete to authenticated
  using (public.has_permission('sales.order.delete') and public.scope_allows(created_by, 'sales'));

drop policy if exists delivery_delete on public.delivery_note;
create policy delivery_delete on public.delivery_note for delete to authenticated
  using (public.has_permission('inventory.delivery.delete'));

drop policy if exists payment_delete on public.payment;
create policy payment_delete on public.payment for delete to authenticated
  using (public.has_permission('invoice.payment.delete'));
