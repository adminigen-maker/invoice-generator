-- =====================================================================
-- 0012 · Auto-provision app_user rows
--
-- So the Admin → Roles & Users screen can see and assign roles to every
-- authenticated user, create an app_user row automatically whenever someone
-- signs up, and backfill anyone who already exists in auth.users.
-- =====================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_user (id, email, display_name, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email, 'User'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill existing auth users that don't yet have a profile row.
insert into public.app_user (id, email, display_name, is_active)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email, 'User'),
  true
from auth.users u
on conflict (id) do nothing;

-- user_role had insert + delete policies but no UPDATE policy; the admin needs
-- it to change a user's data scope (and for upsert-on-conflict to work).
drop policy if exists admin_update_user_roles on public.user_role;
create policy admin_update_user_roles on public.user_role for update to authenticated
  using (public.has_permission('admin.users.edit'))
  with check (public.has_permission('admin.users.edit'));
