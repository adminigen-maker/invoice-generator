-- =====================================================================
-- 0010 · Performance RPCs
--
-- Collapse multi-round-trip read patterns into a single DB call. Round
-- trips are ~free inside the DB region but expensive from the app; these
-- turn "N sequential Supabase hops" into one.
-- =====================================================================

-- Effective permission codes for the current user, resolved server-side in
-- ONE call (role grants ∪ positive overrides, minus negative overrides).
-- Replaces the 3-query chain in lib/rbac/can.ts. Only ever returns the
-- CALLER'S OWN codes (auth.uid()), so security definer is safe here.
create or replace function public.my_permission_codes()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct code), '{}'::text[])
  from (
    select p.code
      from public.user_role ur
      join public.role_permission rp on rp.role_id = ur.role_id
      join public.app_permission p on p.id = rp.permission_id
     where ur.user_id = auth.uid()
    union
    select p.code
      from public.user_permission_override upo
      join public.app_permission p on p.id = upo.permission_id
     where upo.user_id = auth.uid() and upo.granted = true
  ) granted
  where code not in (
    select p.code
      from public.user_permission_override upo
      join public.app_permission p on p.id = upo.permission_id
     where upo.user_id = auth.uid() and upo.granted = false
  );
$$;

revoke execute on function public.my_permission_codes() from public, anon;
grant  execute on function public.my_permission_codes() to authenticated;

-- Dashboard money aggregates in one scalar round trip instead of streaming
-- every invoice row to the app and summing in JS. SECURITY INVOKER so the
-- caller's RLS on `invoice` still applies (each user only sums what they can see).
create or replace function public.dashboard_totals()
returns table (revenue numeric, outstanding numeric)
language sql stable security invoker set search_path = ''
as $$
  select
    coalesce(sum(i.total), 0)::numeric   as revenue,
    coalesce(sum(i.balance), 0)::numeric as outstanding
  from public.invoice i;
$$;

grant execute on function public.dashboard_totals() to authenticated;
