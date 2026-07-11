"use server";

import { P } from "@/lib/rbac/permissions";
import { deleteDocument } from "@/lib/db/doc-lifecycle";

/**
 * Delete a payment. Its payment_allocation rows cascade-delete, and the
 * allocation-rollup trigger restores each affected invoice's balance and status,
 * so this is safe (no orphaned "paid" invoices). Payments have no status, so
 * there is no cancel action.
 */
export async function deletePayment(id: string) {
  return deleteDocument("payment", P.invoice.paymentDelete, "/payments", id);
}
