"use server";

/**
 * Centralized bulk-delete. The client can only pass an entity KEY (allowlisted
 * here) plus a list of ids — never a table name or SQL. Each id is routed
 * through that module's existing single-row delete action, so every per-row
 * guard (permission check, safe-state gate, cross-document FK protection,
 * RLS scope) is enforced exactly as it is for the row-level Delete button.
 */

import { deleteCustomer } from "@/app/(app)/customers/actions";
import { deleteProduct } from "@/app/(app)/products/actions";
import { deleteVendor } from "@/app/(app)/vendors/actions";
import { deletePurchaseOrder } from "@/app/(app)/purchase-orders/actions";
import { deleteSalesOrder } from "@/app/(app)/sales-orders/actions";
import { deleteQuotation } from "@/app/(app)/quotations/actions";
import { deleteDeliveryNote } from "@/app/(app)/delivery-notes/actions";
import { deleteInvoice } from "@/app/(app)/invoices/actions";
import { deletePayment } from "@/app/(app)/payments/actions";

type DeleteFn = (id: string) => Promise<{ ok: boolean; error?: string }>;

const REGISTRY: Record<string, DeleteFn> = {
  customer: deleteCustomer,
  product: deleteProduct,
  vendor: deleteVendor,
  purchase_order: deletePurchaseOrder,
  sales_order: deleteSalesOrder,
  quotation: deleteQuotation,
  delivery_note: deleteDeliveryNote,
  invoice: deleteInvoice,
  payment: deletePayment,
};

export type BulkDeleteResult = { ok: boolean; deleted: number; failed: number; error?: string };

export async function bulkDelete(entity: string, ids: string[]): Promise<BulkDeleteResult> {
  const fn = REGISTRY[entity];
  if (!fn) return { ok: false, deleted: 0, failed: ids.length, error: "Unknown item type." };
  const clean = Array.from(new Set(ids.filter((x) => typeof x === "string" && x.length > 0)));
  if (clean.length === 0) return { ok: false, deleted: 0, failed: 0, error: "Nothing selected." };

  // Sequential: keeps error attribution clear and avoids hammering the DB with a
  // large parallel burst on the free tier. Line counts here are small (a page).
  let deleted = 0;
  const errors: string[] = [];
  for (const id of clean) {
    try {
      const r = await fn(id);
      if (r.ok) deleted++;
      else errors.push(r.error ?? "Could not delete one item.");
    } catch (e) {
      errors.push((e as Error)?.message ?? "Could not delete one item.");
    }
  }
  return { ok: errors.length === 0, deleted, failed: errors.length, error: errors[0] };
}
