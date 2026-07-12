-- =====================================================================
-- 0027 · Revoke direct RPC access to the rollup trigger function
--
-- trg_payment_allocation_rollup was made SECURITY DEFINER in 0021, which left it
-- callable via /rest/v1/rpc. Trigger functions fire without an EXECUTE grant, so
-- revoke direct execution (security advisor 0028/0029).
-- =====================================================================
revoke execute on function public.trg_payment_allocation_rollup() from anon, authenticated, public;
