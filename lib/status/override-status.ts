"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";

/**
 * Admin-only manual status override. The actual permission check + update run
 * inside the SECURITY DEFINER RPC override_document_status (migration 0037),
 * which is gated on 'admin.status.override' and only touches an allowlisted set
 * of tables. This is a label change only — it does NOT move stock or money.
 */

const PATHS: Record<string, string> = {
  quotation: "/quotations",
  sales_order: "/sales-orders",
  delivery_note: "/delivery-notes",
  invoice: "/invoices",
  purchase_order: "/purchase-orders",
};

export async function overrideStatus(
  entity: string,
  id: string,
  status: string
): Promise<{ ok: boolean; error?: string }> {
  const path = PATHS[entity];
  if (!path) return { ok: false, error: "Unknown document type." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("override_document_status", {
    p_entity: entity,
    p_id: id,
    p_status: status,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "You don't have permission to override status." };
    return { ok: false, error: error.message };
  }
  revalidatePath(path);
  revalidatePath(`${path}/${id}`);
  return { ok: true };
}
