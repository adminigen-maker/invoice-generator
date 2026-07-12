-- =====================================================================
-- 0037 · Admin status override
--
-- A grantable permission ('admin.status.override') + a SECURITY DEFINER RPC to
-- set a document's status directly. This is a MANUAL label change only — it
-- does NOT create/reverse stock movements or payments (those stay driven by
-- posting / payments). The RPC bypasses per-table edit RLS on purpose so the
-- permission alone is sufficient; it is gated on the permission internally.
-- =====================================================================

insert into public.app_permission (code, module, action, description)
values ('admin.status.override', 'admin', 'update',
        'Manually override any document status (does not move stock or money)')
on conflict (code) do nothing;

insert into public.role_permission (role_id, permission_id)
  select r.id, p.id from public.role r cross join public.app_permission p
   where r.code = 'admin' and p.code = 'admin.status.override'
on conflict do nothing;

create or replace function public.override_document_status(p_entity text, p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare tbl text;
begin
  if not public.has_permission('admin.status.override') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  tbl := case p_entity
           when 'quotation'      then 'quotation'
           when 'sales_order'    then 'sales_order'
           when 'delivery_note'  then 'delivery_note'
           when 'invoice'        then 'invoice'
           when 'purchase_order' then 'purchase_order'
           else null
         end;
  if tbl is null then
    raise exception 'unknown entity %', p_entity using errcode = '22023';
  end if;

  execute format('update public.%I set status = $1::doc_status where id = $2', tbl)
    using p_status, p_id;
end $$;

revoke execute on function public.override_document_status(text, uuid, text) from anon, public;
grant execute on function public.override_document_status(text, uuid, text) to authenticated;
