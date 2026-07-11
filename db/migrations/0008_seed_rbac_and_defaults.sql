-- =====================================================================
-- 0008 · Seed data — default roles, permissions, tax, UoM, sequences
-- =====================================================================

-- ---------- Permissions catalog ----------
insert into app_permission (code, module, action, description) values
  -- Admin
  ('admin.users.view',                'admin', 'view',   'View users'),
  ('admin.users.edit',                'admin', 'edit',   'Create/edit users, assign roles'),
  ('admin.roles.view',                'admin', 'view',   'View roles & permissions'),
  ('admin.roles.edit',                'admin', 'edit',   'Edit roles & permissions'),
  ('admin.audit.view',                'admin', 'view',   'View audit log'),
  ('admin.company.edit',              'admin', 'edit',   'Edit company profile & branding'),
  ('admin.sequence.edit',             'admin', 'edit',   'Edit document numbering sequences'),
  ('admin.tax.edit',                  'admin', 'edit',   'Edit tax configuration'),

  -- Sales
  ('sales.customer.view',             'sales', 'view',   'View customers'),
  ('sales.customer.create',           'sales', 'create', 'Create customers'),
  ('sales.customer.edit',             'sales', 'edit',   'Edit customers'),
  ('sales.customer.delete',           'sales', 'delete', 'Delete customers'),

  ('sales.quotation.view',            'sales', 'view',   'View quotations'),
  ('sales.quotation.view_cost',       'sales', 'view',   'View cost price / margin on quotations'),
  ('sales.quotation.create',          'sales', 'create', 'Create quotations'),
  ('sales.quotation.edit',            'sales', 'edit',   'Edit quotations'),
  ('sales.quotation.delete',          'sales', 'delete', 'Delete quotations'),
  ('sales.quotation.confirm',         'sales', 'approve','Confirm quotation to Sales Order'),

  ('sales.order.view',                'sales', 'view',   'View sales orders'),
  ('sales.order.create',              'sales', 'create', 'Create sales orders directly'),
  ('sales.order.edit',                'sales', 'edit',   'Edit sales orders'),
  ('sales.order.cancel',              'sales', 'approve','Cancel sales orders'),

  -- Inventory / Delivery
  ('inventory.product.view',          'inventory', 'view',   'View products'),
  ('inventory.product.create',        'inventory', 'create', 'Create products'),
  ('inventory.product.edit',          'inventory', 'edit',   'Edit products'),
  ('inventory.product.delete',        'inventory', 'delete', 'Delete products'),
  ('inventory.product.view_cost',     'inventory', 'view',   'View cost price on products'),

  ('inventory.stock.view',            'inventory', 'view',   'View stock levels & moves'),
  ('inventory.stock.adjust',          'inventory', 'edit',   'Adjust stock manually'),

  ('inventory.delivery.view',         'inventory', 'view',   'View delivery notes'),
  ('inventory.delivery.create',       'inventory', 'create', 'Create delivery notes'),
  ('inventory.delivery.edit',         'inventory', 'edit',   'Edit delivery notes'),
  ('inventory.delivery.post',         'inventory', 'approve','Post delivery note (deducts stock)'),

  ('inventory.receipt.create',        'inventory', 'create', 'Create goods receipts'),

  -- Invoicing
  ('invoice.view',                    'invoice',   'view',   'View invoices'),
  ('invoice.create',                  'invoice',   'create', 'Create invoices'),
  ('invoice.edit',                    'invoice',   'edit',   'Edit draft invoices'),
  ('invoice.post',                    'invoice',   'approve','Post invoice (finalize, no edits)'),
  ('invoice.void',                    'invoice',   'delete', 'Void posted invoice'),
  ('invoice.credit_note.view',        'invoice',   'view',   'View credit notes'),
  ('invoice.credit_note.create',      'invoice',   'create', 'Issue credit notes'),

  ('invoice.payment.view',            'invoice',   'view',   'View payments'),
  ('invoice.payment.create',          'invoice',   'create', 'Record payments'),
  ('invoice.payment.edit',            'invoice',   'edit',   'Edit payments')
on conflict (code) do nothing;

-- ---------- Default roles ----------
insert into role (code, name, description, is_system) values
  ('admin',          'Administrator',   'Full access to everything, including RBAC configuration', true),
  ('sales_manager',  'Sales Manager',   'Full Sales module, view Inventory, financial reports for their team', true),
  ('sales_person',   'Sales Person',    'Create quotations/orders for own customers; no cost price visible', true),
  ('warehouse_staff','Warehouse Staff', 'Delivery notes, goods receipt, stock moves; no pricing', true),
  ('accountant',     'Accountant',      'Invoicing, payments, credit notes, financial reports', true),
  ('viewer',         'Viewer',          'Read-only across all documents', true)
on conflict (code) do nothing;

-- ---------- Grant permissions to each default role ----------
-- Admin: everything.
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r cross join app_permission p
   where r.code = 'admin'
on conflict do nothing;

-- Sales Manager
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'sales_manager'
     and (p.module = 'sales'
       or p.code in (
         'inventory.product.view', 'inventory.product.view_cost',
         'inventory.stock.view', 'inventory.delivery.view',
         'invoice.view', 'invoice.payment.view'))
on conflict do nothing;

-- Sales Person — NO view_cost
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'sales_person'
     and p.code in (
       'sales.customer.view', 'sales.customer.create', 'sales.customer.edit',
       'sales.quotation.view', 'sales.quotation.create', 'sales.quotation.edit',
       'sales.order.view', 'sales.order.create', 'sales.order.edit',
       'inventory.product.view',
       'invoice.view')
on conflict do nothing;

-- Warehouse Staff
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'warehouse_staff'
     and p.code in (
       'inventory.product.view',
       'inventory.stock.view', 'inventory.stock.adjust',
       'inventory.delivery.view', 'inventory.delivery.create',
       'inventory.delivery.edit', 'inventory.delivery.post',
       'inventory.receipt.create',
       'sales.order.view')
on conflict do nothing;

-- Accountant
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'accountant'
     and (p.module = 'invoice'
       or p.code in (
         'sales.customer.view', 'sales.order.view',
         'inventory.product.view', 'inventory.product.view_cost',
         'inventory.stock.view'))
on conflict do nothing;

-- Viewer: only *.view permissions.
insert into role_permission (role_id, permission_id)
  select r.id, p.id from role r, app_permission p
   where r.code = 'viewer' and p.action = 'view'
on conflict do nothing;

-- ---------- Field-level protection ----------
-- cost_price and margin are hidden unless the role holds the view_cost perm.
insert into field_permission (table_name, field_name, required_permission) values
  ('product',            'cost_price',        'inventory.product.view_cost'),
  ('quotation_line',     'cost_at_quote',     'sales.quotation.view_cost'),
  ('sales_order_line',   'cost_at_order',     'sales.quotation.view_cost'),
  ('invoice_line',       'margin',            'sales.quotation.view_cost')
on conflict do nothing;

-- ---------- Currencies / tax ----------
insert into tax_rate (code, name, rate, is_inclusive, is_active) values
  ('VAT_5',   'UAE VAT 5%',           5.000, false, true),
  ('VAT_0',   'Zero-rated',            0.000, false, true),
  ('EXEMPT',  'Exempt',                0.000, false, true)
on conflict (code) do nothing;

-- ---------- Units of measure ----------
insert into unit_of_measure (code, name, category) values
  ('PCS',  'Piece',      'quantity'),
  ('BOX',  'Box',        'quantity'),
  ('KG',   'Kilogram',   'weight'),
  ('G',    'Gram',       'weight'),
  ('L',    'Litre',      'volume'),
  ('ML',   'Millilitre', 'volume'),
  ('HR',   'Hour',       'time'),
  ('DAY',  'Day',        'time'),
  ('SVC',  'Service',    'quantity')
on conflict (code) do nothing;

-- ---------- Document numbering ----------
insert into document_sequence (code, prefix, format, padding, next_number) values
  ('quotation',      'QUO', '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('sales_order',    'SO',  '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('delivery_note',  'DN',  '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('invoice',        'INV', '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('credit_note',    'CN',  '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('payment',        'PAY', '{PREFIX}-{YYYY}-{SEQ}', 5, 1),
  ('customer',       'CUST','{PREFIX}-{SEQ}',        5, 1),
  ('vendor',         'VEND','{PREFIX}-{SEQ}',        5, 1)
on conflict (code) do nothing;

-- ---------- Company placeholder ----------
insert into company (name, legal_name, currency, country)
  values ('Your Company LLC', 'Your Company LLC', 'AED', 'United Arab Emirates')
on conflict do nothing;

-- ---------- Default warehouse + internal locations ----------
insert into warehouse (code, name) values ('WH-MAIN', 'Main Warehouse')
on conflict (code) do nothing;

insert into location (warehouse_id, code, name, kind)
  select w.id, x.code, x.name, x.kind::location_kind
    from warehouse w,
         (values
           ('MAIN',    'Main Stock',      'stock'),
           ('DAMAGED', 'Damaged Goods',   'damaged'),
           ('TRANSIT', 'In Transit',      'transit'),
           ('CUST',    'Customer (virt)', 'customer'),
           ('VEND',    'Vendor (virt)',   'vendor'),
           ('ADJ',     'Adjustment',      'adjustment')
         ) x(code, name, kind)
   where w.code = 'WH-MAIN'
on conflict (warehouse_id, code) do nothing;

-- ---------- Sequence-issuing function ----------
-- Atomic: bumps next_number, applies format, resets yearly if configured.
create or replace function next_document_number(seq_code text) returns text as $$
declare
  s document_sequence%rowtype;
  yr int := extract(year from current_date)::int;
  n int;
  fmt text;
begin
  update document_sequence
     set next_number = case
           when reset_yearly and (last_reset_year is null or last_reset_year < yr) then 2
           else next_number + 1
         end,
         last_reset_year = case
           when reset_yearly and (last_reset_year is null or last_reset_year < yr) then yr
           else last_reset_year
         end
   where code = seq_code
   returning * into s;

  if not found then
    raise exception 'Unknown sequence: %', seq_code;
  end if;

  n := case
    when s.reset_yearly and s.last_reset_year = yr and s.next_number = 2 then 1
    else s.next_number - 1
  end;

  fmt := s.format;
  fmt := replace(fmt, '{PREFIX}', s.prefix);
  fmt := replace(fmt, '{YYYY}',   yr::text);
  fmt := replace(fmt, '{MM}',     lpad(extract(month from current_date)::text, 2, '0'));
  fmt := replace(fmt, '{SEQ}',    lpad(n::text, s.padding, '0'));
  return fmt;
end;
$$ language plpgsql;
