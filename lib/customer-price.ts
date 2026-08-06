"use server";

import { createClient } from "@/lib/db/supabase-server";

/**
 * The last price this customer was invoiced for a product (null if never).
 * `price` is in the unit the line was sold in (`uom`); `factor` is that unit's
 * base-unit conversion, so callers can normalise price/factor to a per-base
 * figure and compare across units. (`factor`/`uom` require migration 0058; they
 * default to 1/null against an older DB so the caller degrades to raw price.)
 */
export async function getCustomerLastPrice(
  customerId: string,
  productId: string
): Promise<{ price: number; date: string; factor: number; uom: string | null } | null> {
  if (!customerId || !productId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_last_price", { p_customer: customerId, p_product: productId });
  if (error || !data) return null;
  const d = data as { price: number; date: string; factor?: number; uom?: string | null };
  return { price: Number(d.price), date: d.date, factor: Number(d.factor ?? 1) || 1, uom: d.uom ?? null };
}
