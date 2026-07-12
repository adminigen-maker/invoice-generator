-- =====================================================================
-- 0021 · Lock down internal rollup RPC + admin usage stats
--
-- (Security advisor) rollup_invoice_paid / rollup_payment_unallocated are
-- internal trigger helpers and must not be callable via the public RPC
-- endpoint. Make the allocation-rollup trigger SECURITY DEFINER so it can still
-- call them, then revoke EXECUTE from the API roles.
--
-- Also adds admin_usage_stats() powering the in-app "Usage & Limits" card.
-- =====================================================================
create or replace function trg_payment_allocation_rollup() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform rollup_invoice_paid(old.invoice_id);
    perform rollup_payment_unallocated(old.payment_id);
    return old;
  else
    perform rollup_invoice_paid(new.invoice_id);
    perform rollup_payment_unallocated(new.payment_id);
    if tg_op = 'UPDATE' and old.invoice_id <> new.invoice_id then
      perform rollup_invoice_paid(old.invoice_id);
    end if;
    return new;
  end if;
end;
$$;

revoke execute on function public.rollup_invoice_paid(uuid) from anon, authenticated, public;
revoke execute on function public.rollup_payment_unallocated(uuid) from anon, authenticated, public;

create or replace function public.admin_usage_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not (public.has_permission('admin.company.edit') or public.has_permission('admin.roles.view')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0),
    'storage_objects', (select count(*) from storage.objects),
    'auth_users', (select count(*) from auth.users),
    'tables', (
      select coalesce(jsonb_agg(t order by t.bytes desc), '[]'::jsonb) from (
        select c.relname as name,
               pg_total_relation_size(c.oid) as bytes,
               greatest(c.reltuples, 0)::bigint as est_rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 8
      ) t
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_usage_stats() from anon, public;
grant execute on function public.admin_usage_stats() to authenticated;
