-- =====================================================================
-- 0002 · Role-Based Access Control
--
-- Three independent layers, per the spec:
--   1. app_permission   — the granular capability catalog
--   2. role → many perms via role_permission
--   3. app_user → many roles via user_role (each carries its own scope)
--
-- user_permission_override lets Admin grant/revoke a single perm for a
-- single user without inventing a whole new role.
--
-- field_permission is Layer 3 (field-level): server strips these columns
-- from API responses when the user's roles lack the tagged view perm.
-- =====================================================================

-- One row per authenticated user. Mirrors auth.users (Supabase).
create table app_user (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  manager_id uuid references app_user(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger app_user_updated before update on app_user
  for each row execute function set_updated_at();

create table role (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'admin', 'sales_manager', ...
  name text not null,
  description text,
  is_system boolean not null default false,  -- system roles cannot be deleted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger role_updated before update on role
  for each row execute function set_updated_at();

create table app_permission (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- 'sales.quotation.create'
  module text not null,               -- 'sales', 'inventory', ...
  action text not null,               -- 'view', 'create', 'edit', 'delete', 'approve', 'void'
  description text
);
create index on app_permission (module);

create table role_permission (
  role_id uuid not null references role(id) on delete cascade,
  permission_id uuid not null references app_permission(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table user_role (
  user_id uuid not null references app_user(id) on delete cascade,
  role_id uuid not null references role(id) on delete cascade,
  scope data_scope not null default 'all',
  scope_ref uuid,                     -- branch_id / warehouse_id when scope='branch'
  primary key (user_id, role_id)
);

create table user_permission_override (
  user_id uuid not null references app_user(id) on delete cascade,
  permission_id uuid not null references app_permission(id) on delete cascade,
  granted boolean not null,           -- true = extra grant, false = revoke
  primary key (user_id, permission_id)
);

-- Layer 3: fields to hide unless the role holds `permission_code` (a view perm).
-- Enforced server-side by lib/rbac/field-filter.ts before shipping to client.
create table field_permission (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  field_name text not null,
  required_permission text not null,  -- e.g. 'sales.quotation.view_cost'
  unique (table_name, field_name)
);

-- Audit log — every meaningful mutation, especially RBAC changes.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id),
  table_name text not null,
  record_id text,
  action audit_action not null,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (table_name, record_id);
create index on audit_log (user_id, created_at desc);
