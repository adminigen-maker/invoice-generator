-- 0051 · Lock down the internal recompute helpers.
--
-- recompute_invoice_status() and rollup_invoice_credited() have no
-- has_permission guard and are only ever called from SECURITY DEFINER functions
-- / triggers (rollup_invoice_paid, trg_credit_note_rollup) that run as the table
-- owner — so no external role needs EXECUTE. public/anon were revoked in 0049;
-- this also revokes `authenticated` so a signed-in user can't invoke an
-- unguarded recompute directly via /rest/v1/rpc/*.
revoke execute on function public.recompute_invoice_status(uuid) from authenticated;
revoke execute on function public.rollup_invoice_credited(uuid)  from authenticated;
