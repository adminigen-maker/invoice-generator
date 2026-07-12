-- =====================================================================
-- 0039 · Remove the manual status override (0037)
--
-- Statuses are now system-driven only (posting, payments, lifecycle) with no
-- manual override. Drop the RPC and delete the permission (role_permission
-- rows cascade away with it).
-- =====================================================================
drop function if exists public.override_document_status(text, uuid, text);
delete from public.app_permission where code = 'admin.status.override';
