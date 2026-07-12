-- =====================================================================
-- 0033 · Allow creating/editing product categories
--
-- product_category previously had only a SELECT policy, so categories could not
-- be added from the app. Adds write policies gated by the product permissions,
-- powering the "+ New category" quick-add on the product form.
-- =====================================================================
drop policy if exists category_insert on public.product_category;
create policy category_insert on public.product_category for insert to authenticated
  with check (public.has_permission('inventory.product.create'));

drop policy if exists category_update on public.product_category;
create policy category_update on public.product_category for update to authenticated
  using (public.has_permission('inventory.product.edit'))
  with check (public.has_permission('inventory.product.edit'));

drop policy if exists category_delete on public.product_category;
create policy category_delete on public.product_category for delete to authenticated
  using (public.has_permission('inventory.product.delete'));
