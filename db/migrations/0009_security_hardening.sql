-- =====================================================================
-- 0009 · Security hardening (addresses Supabase advisor findings)
--
--  1. stock_on_hand view → security_invoker (was SECURITY DEFINER, which
--     bypassed the querying user's RLS on stock_move/product/location).
--  2. Pin search_path on every function (defends SECURITY DEFINER helpers
--     against search_path injection; silences the linter on the rest).
--  3. RBAC helper functions: remove the blanket PUBLIC execute grant so
--     the `anon` role can't probe them over /rest/v1/rpc, while keeping
--     `authenticated` (RLS policies invoke them).
--  4. Tighten audit_log INSERT so only a real session can append.
-- =====================================================================

-- 1. View respects the caller's RLS instead of the creator's.
alter view public.stock_on_hand set (security_invoker = on);

-- 2a. SECURITY DEFINER RBAC helpers: recreate with an empty search_path and
--     fully-qualified identifiers so nothing resolves through a caller-
--     controlled schema.
create or replace function public.has_permission(perm_code text) returns boolean as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;

  -- Negative override wins.
  if exists (
    select 1 from public.user_permission_override upo
    join public.app_permission p on p.id = upo.permission_id
    where upo.user_id = uid and p.code = perm_code and upo.granted = false
  ) then
    return false;
  end if;

  return exists (
    select 1 from public.user_permission_override upo
    join public.app_permission p on p.id = upo.permission_id
    where upo.user_id = uid and p.code = perm_code and upo.granted = true
  ) or exists (
    select 1
      from public.user_role ur
      join public.role_permission rp on rp.role_id = ur.role_id
      join public.app_permission p on p.id = rp.permission_id
     where ur.user_id = uid and p.code = perm_code
  );
end;
$$ language plpgsql stable security definer set search_path = '';

create or replace function public.user_scope(module_code text) returns public.data_scope as $$
declare
  uid uuid := auth.uid();
  best public.data_scope;
begin
  if uid is null then return 'own'::public.data_scope; end if;

  select ur.scope
    into best
    from public.user_role ur
    join public.role_permission rp on rp.role_id = ur.role_id
    join public.app_permission p on p.id = rp.permission_id
   where ur.user_id = uid
     and p.module = module_code
   order by case ur.scope
     when 'all' then 1
     when 'team' then 2
     when 'branch' then 3
     when 'own' then 4
   end
   limit 1;

  return coalesce(best, 'own'::public.data_scope);
end;
$$ language plpgsql stable security definer set search_path = '';

create or replace function public.is_team_member(target uuid) returns boolean as $$
  with recursive tree as (
    select id, manager_id from public.app_user where manager_id = auth.uid()
    union all
    select u.id, u.manager_id
      from public.app_user u
      join tree t on u.manager_id = t.id
  )
  select exists (select 1 from tree where id = target)
     or target = auth.uid();
$$ language sql stable security definer set search_path = '';

create or replace function public.scope_allows(created_by_col uuid, module_code text)
returns boolean as $$
declare
  s public.data_scope := public.user_scope(module_code);
begin
  if s = 'all' then return true; end if;
  if s = 'own' then return created_by_col = auth.uid(); end if;
  if s = 'team' then return public.is_team_member(created_by_col); end if;
  return false;
end;
$$ language plpgsql stable security definer set search_path = '';

-- 2b. Remaining functions (SECURITY INVOKER triggers/utilities): pin the
--     path without rewriting their bodies. public stays resolvable.
alter function public.set_updated_at()                    set search_path = public, pg_temp;
alter function public.next_document_number(text)          set search_path = public, pg_temp;
alter function public.rollup_delivered_qty(uuid)          set search_path = public, pg_temp;
alter function public.trg_delivery_note_line_rollup()     set search_path = public, pg_temp;
alter function public.rollup_invoiced_qty(uuid)           set search_path = public, pg_temp;
alter function public.trg_invoice_line_rollup()           set search_path = public, pg_temp;
alter function public.rollup_invoice_paid(uuid)           set search_path = public, pg_temp;
alter function public.rollup_payment_unallocated(uuid)    set search_path = public, pg_temp;
alter function public.trg_payment_allocation_rollup()     set search_path = public, pg_temp;
alter function public.stock_move_immutable()              set search_path = public, pg_temp;
alter function public.post_delivery_note_moves()          set search_path = public, pg_temp;

-- 3. RBAC helpers: keep EXECUTE only for `authenticated` (RLS policies invoke
--    them). Supabase's default privileges grant EXECUTE directly to both
--    `anon` and `authenticated`, so revoke `anon` explicitly (revoking PUBLIC
--    alone does not remove the direct per-role grant).
revoke execute on function public.has_permission(text)          from public, anon;
revoke execute on function public.user_scope(text)              from public, anon;
revoke execute on function public.is_team_member(uuid)          from public, anon;
revoke execute on function public.scope_allows(uuid, text)      from public, anon;
grant  execute on function public.has_permission(text)          to authenticated;
grant  execute on function public.user_scope(text)              to authenticated;
grant  execute on function public.is_team_member(uuid)          to authenticated;
grant  execute on function public.scope_allows(uuid, text)      to authenticated;

-- NOTE: the 4 helpers remain callable by `authenticated` via /rest/v1/rpc,
-- which Supabase's advisor flags as WARN. This is accepted by design:
--   * RLS policies on every table invoke them, so `authenticated` MUST hold
--     EXECUTE — revoking it would break row-level security entirely.
--   * They only ever reveal the CALLER'S OWN authorization state
--     (has_permission → own boolean, user_scope → own scope,
--      is_team_member/scope_allows → own reporting tree). No cross-user data.
-- To silence the WARN entirely, move these four into a non-exposed schema
-- (e.g. `private`) and update the policy references — deferred as it touches
-- all 57 policies and needs live-session RLS testing.

-- 4. audit_log: require an authenticated session to append (was WITH CHECK true).
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (auth.uid() is not null);
