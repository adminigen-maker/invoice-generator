-- =====================================================================
-- 0018 · Protect assigned roles from deletion (ON DELETE RESTRICT)
--
-- user_role.role_id previously referenced role(id) ON DELETE CASCADE. With the
-- new "Delete role" admin action, that meant deleting a role could silently
-- strip every user's assignment — and the app-side "is it assigned?" guard can
-- under-count for a caller who holds admin.roles.edit but NOT admin.users.view
-- (RLS hides other users' user_role rows). Making the FK RESTRICT moves the
-- guarantee into the database: a role that is still assigned cannot be deleted.
-- (role_permission.role_id stays ON DELETE CASCADE — a deleted role's grants
-- should disappear with it.)
-- =====================================================================
alter table public.user_role drop constraint if exists user_role_role_id_fkey;
alter table public.user_role
  add constraint user_role_role_id_fkey
  foreign key (role_id) references public.role(id) on delete restrict;
