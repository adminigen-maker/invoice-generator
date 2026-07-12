-- =====================================================================
-- 0028 · Audit logging
--
-- A generic trigger records every insert/update/delete on the financial and
-- master tables into audit_log, capturing the acting user (auth.uid()) and, for
-- updates, only the columns that changed. SECURITY DEFINER so it always writes.
-- Viewable by admins in Settings → Audit log (admin.audit.view).
-- =====================================================================
create or replace function public.audit_trigger() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  old_j jsonb;
  new_j jsonb;
  chg jsonb;
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log(user_id, table_name, record_id, action, changes)
    values (uid, tg_table_name, old.id::text, 'delete', to_jsonb(old));
    return old;
  elsif tg_op = 'INSERT' then
    insert into public.audit_log(user_id, table_name, record_id, action, changes)
    values (uid, tg_table_name, new.id::text, 'insert', to_jsonb(new));
    return new;
  else
    old_j := to_jsonb(old);
    new_j := to_jsonb(new);
    select jsonb_object_agg(k.key, jsonb_build_object('from', old_j -> k.key, 'to', new_j -> k.key))
      into chg
    from jsonb_object_keys(new_j) as k(key)
    where (old_j -> k.key) is distinct from (new_j -> k.key)
      and k.key <> 'updated_at';
    if chg is null then return new; end if;
    insert into public.audit_log(user_id, table_name, record_id, action, changes)
    values (uid, tg_table_name, new.id::text, 'update', chg);
    return new;
  end if;
end;
$$;

revoke execute on function public.audit_trigger() from anon, authenticated, public;

do $$
declare t text;
begin
  foreach t in array array['invoice','payment','purchase_order','sales_order','quotation',
                           'delivery_note','customer','vendor','product']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;
