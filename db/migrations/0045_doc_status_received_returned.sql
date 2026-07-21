-- =====================================================================
-- 0045 · Add 'received' and 'returned' to doc_status
--
-- 'received'  — purchase orders. receivePurchaseOrder always set this, but the
--               value never existed in the enum, so every Receive click failed.
-- 'returned'  — invoices fully credited back (customer returned everything);
--               treated as an inactive/closed state.
-- =====================================================================
alter type public.doc_status add value if not exists 'received';
alter type public.doc_status add value if not exists 'returned';
