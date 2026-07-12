"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";

/**
 * Set a product's on-hand to an exact quantity. The permission check + the
 * reconciling stock_move happen inside the SECURITY DEFINER RPC adjust_stock
 * (migration 0038), gated on inventory.stock.adjust.
 */
export async function adjustStock(
  productId: string,
  newQty: number,
  reason: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(newQty) || newQty < 0) {
    return { ok: false, error: "Enter a valid quantity (0 or more)." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: productId,
    p_new_qty: newQty,
    p_reason: reason || null,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "You don't have permission to adjust stock." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/inventory");
  revalidatePath("/products");
  return { ok: true };
}
