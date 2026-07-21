"use server";

import { createClient } from "@/lib/db/supabase-server";

/** The last price this customer was invoiced for a product (null if never). */
export async function getCustomerLastPrice(
  customerId: string,
  productId: string
): Promise<{ price: number; date: string } | null> {
  if (!customerId || !productId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_last_price", { p_customer: customerId, p_product: productId });
  if (error || !data) return null;
  const d = data as { price: number; date: string };
  return { price: Number(d.price), date: d.date };
}
