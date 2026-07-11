-- =====================================================================
-- 0007 · Row-Level Security policies
--
-- Layer 2 of RBAC (data scope) lives here in the DB.
-- Layer 1 (module/action perms) is enforced in server actions via can().
-- Layer 3 (field-level) is enforced by the field-filter middleware.
--
-- Strategy: RLS is a defense-in-depth SAFETY NET, not the primary check.
-- The app calls can() before every mutation; RLS just refuses to leak
-- rows even if the app forgets.
-- =====================================================================

-- Helper: does the current user hold this permission?
-- Union of role_permission and positive user_permission_override,
-- minus negative overrides.
create or replace function has_permission(perm_code text) returns boolean as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;

  -- Negative override wins.
  if exists (
    select 1 from user_permission_override upo
    join app_permission p on p.id = upo.permission_id
    where upo.user_id = uid and p.code = perm_code and upo.granted = false
  ) then
    return false;
  end if;

  -- Positive override or role-based grant.
  return exists (
    select 1 from user_permission_override upo
    join app_permission p on p.id = upo.permission_id
    where upo.user_id = uid and p.code = perm_code and upo.granted = true
  ) or exists (
    select 1
      from user_role ur
      join role_permission rp on rp.role_id = ur.role_id
      join app_permission p on p.id = rp.permission_id
     where ur.user_id = uid and p.code = perm_code
  );
end;
$$ language plpgsql stable security definer;

-- Max data scope the current user has for a given module.
-- Ordering: all > team > branch > own.
create or replace function user_scope(module_code text) returns data_scope as $$
declare
  uid uuid := auth.uid();
  best data_scope;
begin
  if uid is null then return 'own'::data_scope; end if;

  select ur.scope
    into best
    from user_role ur
    join role_permission rp on rp.role_id = ur.role_id
    join app_permission p on p.id = rp.permission_id
   where ur.user_id = uid
     and p.module = module_code
   order by case ur.scope
     when 'all' then 1
     when 'team' then 2
     when 'branch' then 3
     when 'own' then 4
   end
   limit 1;

  return coalesce(best, 'own'::data_scope);
end;
$$ language plpgsql stable security definer;

-- Is target_user in the current user's reporting tree (any depth)?
create or replace function is_team_member(target uuid) returns boolean as $$
  with recursive tree as (
    select id, manager_id from app_user where manager_id = auth.uid()
    union all
    select u.id, u.manager_id
      from app_user u
      join tree t on u.manager_id = t.id
  )
  select exists (select 1 from tree where id = target)
     or target = auth.uid();
$$ language sql stable security definer;

-- Convenience: matches a row's created_by against the current user + scope.
create or replace function scope_allows(created_by_col uuid, module_code text)
returns boolean as $$
declare
  s data_scope := user_scope(module_code);
begin
  if s = 'all' then return true; end if;
  if s = 'own' then return created_by_col = auth.uid(); end if;
  if s = 'team' then return is_team_member(created_by_col); end if;
  -- 'branch' scope is context-specific; enforced in per-table policies.
  return false;
end;
$$ language plpgsql stable security definer;

-- ---------- Enable RLS on all user-facing tables ----------
alter table app_user                    enable row level security;
alter table role                        enable row level security;
alter table app_permission              enable row level security;
alter table role_permission             enable row level security;
alter table user_role                   enable row level security;
alter table user_permission_override    enable row level security;
alter table field_permission            enable row level security;
alter table audit_log                   enable row level security;

alter table company                     enable row level security;
alter table tax_rate                    enable row level security;
alter table document_sequence           enable row level security;
alter table product_category            enable row level security;
alter table unit_of_measure             enable row level security;
alter table uom_conversion              enable row level security;
alter table product                     enable row level security;
alter table customer                    enable row level security;
alter table customer_address            enable row level security;
alter table vendor                      enable row level security;
alter table warehouse                   enable row level security;
alter table location                    enable row level security;

alter table quotation                   enable row level security;
alter table quotation_line              enable row level security;
alter table sales_order                 enable row level security;
alter table sales_order_line            enable row level security;
alter table delivery_note               enable row level security;
alter table delivery_note_line          enable row level security;

alter table invoice                     enable row level security;
alter table invoice_line                enable row level security;
alter table credit_note                 enable row level security;
alter table payment                     enable row level security;
alter table payment_allocation          enable row level security;

alter table stock_move                  enable row level security;

-- ---------- Baseline policies ----------
-- Every authenticated user can read reference tables (master data catalogs).
create policy read_all_authed on tax_rate            for select to authenticated using (true);
create policy read_all_authed on document_sequence   for select to authenticated using (true);
create policy read_all_authed on product_category    for select to authenticated using (true);
create policy read_all_authed on unit_of_measure     for select to authenticated using (true);
create policy read_all_authed on uom_conversion      for select to authenticated using (true);
create policy read_all_authed on warehouse           for select to authenticated using (true);
create policy read_all_authed on location            for select to authenticated using (true);
create policy read_all_authed on company             for select to authenticated using (true);
create policy read_all_authed on app_permission      for select to authenticated using (true);
create policy read_all_authed on role                for select to authenticated using (true);
-- The app must read role_permission and its own overrides to compute effective perms.
create policy read_all_authed on role_permission     for select to authenticated using (true);
create policy read_own_overrides on user_permission_override for select to authenticated using (user_id = auth.uid());
create policy read_all_authed on field_permission    for select to authenticated using (true);

-- Users can read themselves; admins can read all.
create policy read_self on app_user for select to authenticated
  using (id = auth.uid() or has_permission('admin.users.view'));
create policy admin_write on app_user for all to authenticated
  using (has_permission('admin.users.edit'))
  with check (has_permission('admin.users.edit'));

-- Product master
create policy product_read on product for select to authenticated
  using (has_permission('inventory.product.view'));
create policy product_write on product for insert to authenticated
  with check (has_permission('inventory.product.create'));
create policy product_update on product for update to authenticated
  using (has_permission('inventory.product.edit'))
  with check (has_permission('inventory.product.edit'));
create policy product_delete on product for delete to authenticated
  using (has_permission('inventory.product.delete'));

-- Customer master
create policy customer_read on customer for select to authenticated
  using (has_permission('sales.customer.view')
         and scope_allows(created_by, 'sales'));
create policy customer_insert on customer for insert to authenticated
  with check (has_permission('sales.customer.create'));
create policy customer_update on customer for update to authenticated
  using (has_permission('sales.customer.edit') and scope_allows(created_by, 'sales'))
  with check (has_permission('sales.customer.edit'));

create policy customer_address_all on customer_address for all to authenticated
  using (exists (
    select 1 from customer c where c.id = customer_id
      and has_permission('sales.customer.view')
      and scope_allows(c.created_by, 'sales')))
  with check (has_permission('sales.customer.edit'));

-- Sales flow: Quotation → Sales Order → Delivery Note
create policy quotation_read on quotation for select to authenticated
  using (has_permission('sales.quotation.view') and scope_allows(created_by, 'sales'));
create policy quotation_insert on quotation for insert to authenticated
  with check (has_permission('sales.quotation.create'));
create policy quotation_update on quotation for update to authenticated
  using (has_permission('sales.quotation.edit') and scope_allows(created_by, 'sales'))
  with check (has_permission('sales.quotation.edit'));
create policy quotation_delete on quotation for delete to authenticated
  using (has_permission('sales.quotation.delete') and scope_allows(created_by, 'sales'));

create policy quotation_line_all on quotation_line for all to authenticated
  using (exists (select 1 from quotation q where q.id = quotation_id
                   and has_permission('sales.quotation.view')
                   and scope_allows(q.created_by, 'sales')))
  with check (exists (select 1 from quotation q where q.id = quotation_id
                        and has_permission('sales.quotation.edit')));

create policy sales_order_read on sales_order for select to authenticated
  using (has_permission('sales.order.view') and scope_allows(created_by, 'sales'));
create policy sales_order_insert on sales_order for insert to authenticated
  with check (has_permission('sales.order.create'));
create policy sales_order_update on sales_order for update to authenticated
  using (has_permission('sales.order.edit') and scope_allows(created_by, 'sales'))
  with check (has_permission('sales.order.edit'));

create policy sales_order_line_all on sales_order_line for all to authenticated
  using (exists (select 1 from sales_order so where so.id = sales_order_id
                   and has_permission('sales.order.view')
                   and scope_allows(so.created_by, 'sales')))
  with check (exists (select 1 from sales_order so where so.id = sales_order_id
                        and has_permission('sales.order.edit')));

create policy delivery_read on delivery_note for select to authenticated
  using (has_permission('inventory.delivery.view'));
create policy delivery_insert on delivery_note for insert to authenticated
  with check (has_permission('inventory.delivery.create'));
create policy delivery_update on delivery_note for update to authenticated
  using (has_permission('inventory.delivery.edit'))
  with check (has_permission('inventory.delivery.edit'));

create policy delivery_line_all on delivery_note_line for all to authenticated
  using (exists (select 1 from delivery_note d where d.id = delivery_note_id
                   and has_permission('inventory.delivery.view')))
  with check (exists (select 1 from delivery_note d where d.id = delivery_note_id
                        and has_permission('inventory.delivery.edit')));

-- Invoicing
create policy invoice_read on invoice for select to authenticated
  using (has_permission('invoice.view') and scope_allows(created_by, 'invoice'));
create policy invoice_insert on invoice for insert to authenticated
  with check (has_permission('invoice.create'));
create policy invoice_update on invoice for update to authenticated
  using (has_permission('invoice.edit') and scope_allows(created_by, 'invoice'))
  with check (has_permission('invoice.edit'));
create policy invoice_delete on invoice for delete to authenticated
  using (has_permission('invoice.void') and scope_allows(created_by, 'invoice'));

create policy invoice_line_all on invoice_line for all to authenticated
  using (exists (select 1 from invoice i where i.id = invoice_id
                   and has_permission('invoice.view')
                   and scope_allows(i.created_by, 'invoice')))
  with check (exists (select 1 from invoice i where i.id = invoice_id
                        and has_permission('invoice.edit')));

create policy credit_note_all on credit_note for all to authenticated
  using (has_permission('invoice.credit_note.view'))
  with check (has_permission('invoice.credit_note.create'));

create policy payment_read on payment for select to authenticated
  using (has_permission('invoice.payment.view'));
create policy payment_insert on payment for insert to authenticated
  with check (has_permission('invoice.payment.create'));
create policy payment_update on payment for update to authenticated
  using (has_permission('invoice.payment.edit'))
  with check (has_permission('invoice.payment.edit'));

create policy payment_alloc_all on payment_allocation for all to authenticated
  using (has_permission('invoice.payment.view'))
  with check (has_permission('invoice.payment.create'));

-- Inventory
create policy stock_move_read on stock_move for select to authenticated
  using (has_permission('inventory.stock.view'));
create policy stock_move_insert on stock_move for insert to authenticated
  with check (has_permission('inventory.stock.adjust')
              or has_permission('inventory.delivery.create')
              or has_permission('inventory.receipt.create'));

-- Audit log — write-only for the app (via triggers); admins read.
create policy audit_read on audit_log for select to authenticated
  using (has_permission('admin.audit.view'));
create policy audit_insert on audit_log for insert to authenticated
  with check (true);

-- RBAC catalog editing — admin only.
create policy admin_write_roles on role for all to authenticated
  using (has_permission('admin.roles.edit'))
  with check (has_permission('admin.roles.edit'));

create policy admin_write_role_perm on role_permission for all to authenticated
  using (has_permission('admin.roles.edit'))
  with check (has_permission('admin.roles.edit'));

create policy admin_read_user_roles on user_role for select to authenticated
  using (user_id = auth.uid() or has_permission('admin.users.view'));
create policy admin_write_user_roles on user_role for insert to authenticated
  with check (has_permission('admin.users.edit'));
create policy admin_del_user_roles on user_role for delete to authenticated
  using (has_permission('admin.users.edit'));

create policy admin_write_overrides on user_permission_override for all to authenticated
  using (has_permission('admin.users.edit'))
  with check (has_permission('admin.users.edit'));

create policy admin_field_perm on field_permission for all to authenticated
  using (has_permission('admin.roles.edit'))
  with check (has_permission('admin.roles.edit'));
