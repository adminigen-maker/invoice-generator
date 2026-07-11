"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { cancelDocument, deleteDocument } from "@/lib/db/doc-lifecycle";

export async function cancelDeliveryNote(id: string) {
  return cancelDocument("delivery_note", P.inventory.deliveryEdit, "/delivery-notes", id);
}

export async function deleteDeliveryNote(id: string) {
  return deleteDocument("delivery_note", P.inventory.deliveryDelete, "/delivery-notes", id);
}

/**
 * Post a delivery note: sets posted_at → the DB trigger creates the stock moves
 * (source = warehouse stock location, dest = virtual customer location).
 * After posting, the note is immutable and the SO line's quantity_delivered
 * is rolled up automatically.
 */
export async function postDeliveryNote(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission(P.inventory.deliveryPost);
  const supabase = await createClient();
  const { error } = await supabase
    .from("delivery_note")
    .update({ posted_at: new Date().toISOString(), status: "delivered" })
    .eq("id", id)
    .is("posted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/delivery-notes");
  revalidatePath(`/delivery-notes/${id}`);
  revalidatePath("/sales-orders");
  return { ok: true };
}
