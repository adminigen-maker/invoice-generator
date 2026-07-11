/**
 * Which lifecycle states allow Cancel / Delete on a document.
 *
 * These are SAFE states — early stages with no stock or financial side effects:
 *  - Cancel just flips status to 'cancelled'. It's offered only where a plain
 *    status flip leaves no dangling side effect. Delivery notes are deliberately
 *    NOT cancellable: their lines feed sales_order_line.quantity_delivered, so a
 *    status-only cancel would leave delivered quantities inflated — use Delete
 *    (which cascades the lines and restores the rollup) instead.
 *  - Delete is a hard delete; only allowed for draft/cancelled documents. Cross-
 *    document foreign keys (NO ACTION) block deleting anything with downstream
 *    records; posted delivery notes / invoices are additionally blocked by a DB
 *    trigger. For payments the allocation-rollup trigger restores the invoice's
 *    balance AND status, so payments have no status gate.
 *
 * Shared by the list pages (to decide which buttons to show) and the server
 * actions (which ENFORCE these — the UI is only a convenience).
 */
export type DocType = "quotation" | "sales_order" | "delivery_note" | "invoice" | "payment";

export const CANCELLABLE_STATUS: Partial<Record<DocType, string[]>> = {
  quotation: ["draft", "sent"],
  sales_order: ["draft", "confirmed"],
  invoice: ["draft"],
};

export const DELETABLE_STATUS: Partial<Record<DocType, string[]>> = {
  quotation: ["draft", "sent", "cancelled"],
  sales_order: ["draft", "confirmed", "cancelled"],
  delivery_note: ["draft", "cancelled"],
  invoice: ["draft", "cancelled"],
  // payment: no status column — always deletable (balance is restored by trigger)
};

export function canCancelDoc(type: DocType, status: string | null | undefined): boolean {
  const allowed = CANCELLABLE_STATUS[type];
  return !!allowed && !!status && allowed.includes(status);
}

export function canDeleteDoc(type: DocType, status: string | null | undefined): boolean {
  const allowed = DELETABLE_STATUS[type];
  if (!allowed) return true; // no status gate (e.g. payment)
  return !!status && allowed.includes(status);
}
