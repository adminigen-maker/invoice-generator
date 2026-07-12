-- =====================================================================
-- 0022 · Product SKU numbering sequence
--
-- Lets the product form auto-generate a SKU (e.g. SKU-00001) when the user
-- leaves the field blank, mirroring how customer codes and document numbers
-- already work. Not reset yearly — SKUs are permanent identifiers.
-- =====================================================================
insert into public.document_sequence (code, prefix, format, padding, next_number, reset_yearly)
select 'product', 'SKU', '{PREFIX}-{SEQ}', 5, 1, false
where not exists (select 1 from public.document_sequence where code = 'product');
