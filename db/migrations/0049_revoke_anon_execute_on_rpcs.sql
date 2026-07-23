-- 0049_revoke_anon_execute_on_rpcs.sql
--
-- Security fix: several SECURITY DEFINER RPCs were executable by PUBLIC/anon via
-- /rest/v1/rpc/*, letting an UNAUTHENTICATED caller (holding only the public anon
-- key, which ships in the browser bundle) read financial data and invoke recompute
-- helpers — all bypassing RLS because SECURITY DEFINER runs as the owner.
--
-- Confirmed leak: `dashboard_operational(null)` called as `anon` returned overdue
-- invoices with customer names + amounts, collected-this-month revenue, open POs,
-- and draft-quotation counts. `dashboard_operational`, `recompute_invoice_status`
-- and `rollup_invoice_credited` had NO internal has_permission() guard.
--
-- The application only ever calls these functions as the `authenticated` role, and
-- triggers execute as the table owner regardless of EXECUTE grants — so dropping
-- PUBLIC/anon EXECUTE closes the hole with zero impact on the app.

-- Report/read RPCs the app calls as authenticated: drop PUBLIC (which includes anon).
revoke execute on function public.dashboard_operational(uuid)       from public, anon;
revoke execute on function public.customer_last_price(uuid, uuid)   from public, anon;
revoke execute on function public.profit_report(date, date, uuid)   from public, anon;
revoke execute on function public.reports_summary(date, date, uuid) from public, anon;
revoke execute on function public.vat_report(date, date, uuid)      from public, anon;
revoke execute on function public.next_document_number(text)        from public, anon;

-- Internal recompute helpers (no application caller; invoked via triggers / definer context).
revoke execute on function public.recompute_invoice_status(uuid)    from public, anon;
revoke execute on function public.rollup_invoice_credited(uuid)     from public, anon;

-- Pure trigger functions: no external caller ever needs EXECUTE.
revoke execute on function public.post_invoice_stock_moves()        from public, anon, authenticated;
revoke execute on function public.trg_credit_note_rollup()          from public, anon, authenticated;
