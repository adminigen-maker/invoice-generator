-- =====================================================================
-- 0013 · Security & performance hardening (from advisor findings)
-- =====================================================================

-- SECURITY: the auth.users trigger function must not be RPC-callable. It only
-- ever runs as a trigger (which executes as its owner regardless of grants).
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

-- PERFORMANCE (RLS initplan): wrap auth.uid() in a scalar subselect so it is
-- evaluated ONCE per query instead of once per row.
drop policy if exists read_own_overrides on public.user_permission_override;
create policy read_own_overrides on public.user_permission_override for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists read_self on public.app_user;
create policy read_self on public.app_user for select to authenticated
  using (id = (select auth.uid()) or public.has_permission('admin.users.view'));

drop policy if exists admin_read_user_roles on public.user_role;
create policy admin_read_user_roles on public.user_role for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('admin.users.view'));

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check ((select auth.uid()) is not null);

-- PERFORMANCE: covering indexes on foreign keys (speeds up joins, cascade
-- deletes, and especially the created_by columns used by RLS scope checks).
create index if not exists idx_app_user_manager_id on public.app_user(manager_id);
create index if not exists idx_credit_note_created_by on public.credit_note(created_by);
create index if not exists idx_credit_note_customer_id on public.credit_note(customer_id);
create index if not exists idx_credit_note_invoice_id on public.credit_note(invoice_id);
create index if not exists idx_customer_created_by on public.customer(created_by);
create index if not exists idx_customer_default_tax_id on public.customer(default_tax_id);
create index if not exists idx_delivery_note_created_by on public.delivery_note(created_by);
create index if not exists idx_delivery_note_warehouse_id on public.delivery_note(warehouse_id);
create index if not exists idx_delivery_note_line_product_id on public.delivery_note_line(product_id);
create index if not exists idx_delivery_note_line_source_location_id on public.delivery_note_line(source_location_id);
create index if not exists idx_delivery_note_line_uom_id on public.delivery_note_line(uom_id);
create index if not exists idx_invoice_created_by on public.invoice(created_by);
create index if not exists idx_invoice_sales_order_id on public.invoice(sales_order_id);
create index if not exists idx_invoice_line_delivery_note_line_id on public.invoice_line(delivery_note_line_id);
create index if not exists idx_invoice_line_product_id on public.invoice_line(product_id);
create index if not exists idx_invoice_line_sales_order_line_id on public.invoice_line(sales_order_line_id);
create index if not exists idx_invoice_line_tax_id on public.invoice_line(tax_id);
create index if not exists idx_invoice_line_uom_id on public.invoice_line(uom_id);
create index if not exists idx_payment_created_by on public.payment(created_by);
create index if not exists idx_product_created_by on public.product(created_by);
create index if not exists idx_product_tax_id on public.product(tax_id);
create index if not exists idx_product_uom_id on public.product(uom_id);
create index if not exists idx_product_category_parent_id on public.product_category(parent_id);
create index if not exists idx_quotation_created_by on public.quotation(created_by);
create index if not exists idx_quotation_line_product_id on public.quotation_line(product_id);
create index if not exists idx_quotation_line_tax_id on public.quotation_line(tax_id);
create index if not exists idx_quotation_line_uom_id on public.quotation_line(uom_id);
create index if not exists idx_role_permission_permission_id on public.role_permission(permission_id);
create index if not exists idx_sales_order_created_by on public.sales_order(created_by);
create index if not exists idx_sales_order_quotation_id on public.sales_order(quotation_id);
create index if not exists idx_sales_order_line_product_id on public.sales_order_line(product_id);
create index if not exists idx_sales_order_line_quotation_line_id on public.sales_order_line(quotation_line_id);
create index if not exists idx_sales_order_line_tax_id on public.sales_order_line(tax_id);
create index if not exists idx_sales_order_line_uom_id on public.sales_order_line(uom_id);
create index if not exists idx_stock_move_created_by on public.stock_move(created_by);
create index if not exists idx_stock_move_uom_id on public.stock_move(uom_id);
create index if not exists idx_uom_conversion_to_uom_id on public.uom_conversion(to_uom_id);
create index if not exists idx_user_permission_override_permission_id on public.user_permission_override(permission_id);
create index if not exists idx_user_role_role_id on public.user_role(role_id);
create index if not exists idx_vendor_created_by on public.vendor(created_by);
create index if not exists idx_vendor_default_tax_id on public.vendor(default_tax_id);
