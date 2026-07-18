import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Verifies the idempotency guard in createDeliveryAndInvoiceFromSO: it must
 * create a delivery note + invoice exactly once, and refuse to create a second
 * set when either already exists for the sales order (the reported bug, where a
 * re-run / POST replay created documents again).
 *
 * Supabase, auth, and Next cache/navigation are mocked; pricing is the real
 * pure module.
 */

const h = vi.hoisted(() => ({
  existingDn: [] as unknown[],
  existingInv: [] as unknown[],
  inserts: [] as { table: string; payload?: unknown; update?: unknown }[],
  so: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/rbac/can", () => ({ requirePermission: async () => {} }));
vi.mock("@/lib/db/supabase-server", () => {
  function single(table: string) {
    switch (table) {
      case "sales_order": return { data: h.so };
      case "warehouse": return { data: { id: "wh1" } };
      case "customer": return { data: { payment_terms_days: 30 } };
      case "delivery_note": return { data: { id: "dn1" } }; // insert ... select().single()
      case "invoice": return { data: { id: "inv1" } };       // insert ... select().single()
      default: return { data: null };
    }
  }
  function list(table: string, isInsert: boolean) {
    switch (table) {
      case "delivery_note": return { data: isInsert ? [] : h.existingDn };
      case "invoice": return { data: isInsert ? [] : h.existingInv };
      case "delivery_note_line": return { data: [{ id: "dnl1", sales_order_line_id: "sol1" }] };
      case "tax_rate": return { data: [] };
      default: return { data: [] };
    }
  }
  function builder(table: string) {
    let isInsert = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      insert: (payload: unknown) => { isInsert = true; h.inserts.push({ table, payload }); return b; },
      update: (payload: unknown) => { h.inserts.push({ table, update: payload }); return b; },
      maybeSingle: async () => single(table),
      single: async () => single(table),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(list(table, isInsert)).then(res, rej),
    };
    return b;
  }
  return {
    createClient: async () => ({
      from: (t: string) => builder(t),
      rpc: async () => ({ data: "NUM-1" }),
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    }),
  };
});

import { createDeliveryAndInvoiceFromSO } from "@/app/(app)/sales-orders/actions";

const baseSo = () => ({
  id: "so1",
  currency: "AED",
  customer_id: "c1",
  lines: [
    { id: "sol1", product_id: "p1", uom_id: "u1", description: "Widget", quantity_ordered: 5, quantity_delivered: 0, unit_price: 10, discount_pct: 0, tax_id: null },
  ],
});

beforeEach(() => {
  h.existingDn = [];
  h.existingInv = [];
  h.inserts = [];
  h.so = baseSo();
});

describe("createDeliveryAndInvoiceFromSO", () => {
  it("creates one delivery note + one invoice when none exist yet", async () => {
    const res = await createDeliveryAndInvoiceFromSO("so1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.deliveryNoteId).toBe("dn1");
      expect(res.invoiceId).toBe("inv1");
    }
    const tables = h.inserts.map((i) => i.table);
    expect(tables).toContain("delivery_note");
    expect(tables).toContain("invoice");
  });

  it("refuses (no inserts) when a delivery note already exists — the reported bug", async () => {
    h.existingDn = [{ id: "dn-existing" }];
    const res = await createDeliveryAndInvoiceFromSO("so1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already exist/i);
    expect(h.inserts).toHaveLength(0);
  });

  it("refuses (no inserts) when an invoice already exists", async () => {
    h.existingInv = [{ id: "inv-existing" }];
    const res = await createDeliveryAndInvoiceFromSO("so1");
    expect(res.ok).toBe(false);
    expect(h.inserts).toHaveLength(0);
  });
});
