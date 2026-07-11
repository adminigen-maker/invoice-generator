-- =====================================================================
-- 0015 · Company fields used by the printed invoice/quotation footer
-- =====================================================================
alter table public.company add column if not exists bank_account text;
alter table public.company add column if not exists whatsapp text;
