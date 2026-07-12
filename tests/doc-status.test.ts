import { describe, it, expect } from "vitest";
import { canCancelDoc, canDeleteDoc } from "@/lib/doc-status";

describe("canCancelDoc", () => {
  it("allows cancelling early-stage quotations/orders/invoices", () => {
    expect(canCancelDoc("quotation", "draft")).toBe(true);
    expect(canCancelDoc("quotation", "sent")).toBe(true);
    expect(canCancelDoc("sales_order", "confirmed")).toBe(true);
    expect(canCancelDoc("invoice", "draft")).toBe(true);
  });

  it("refuses cancel once past the safe state", () => {
    expect(canCancelDoc("quotation", "confirmed")).toBe(false);
    expect(canCancelDoc("invoice", "paid")).toBe(false);
    expect(canCancelDoc("invoice", "invoiced")).toBe(false);
  });

  it("never offers cancel for delivery notes (delete-only)", () => {
    expect(canCancelDoc("delivery_note", "draft")).toBe(false);
  });

  it("is false for null/unknown status", () => {
    expect(canCancelDoc("invoice", null)).toBe(false);
    expect(canCancelDoc("invoice", undefined)).toBe(false);
  });
});

describe("canDeleteDoc", () => {
  it("lets quotations & sales orders delete in any status (FK is the guard)", () => {
    expect(canDeleteDoc("quotation", "confirmed")).toBe(true);
    expect(canDeleteDoc("sales_order", "delivered")).toBe(true);
  });

  it("restricts invoices & delivery notes to draft/cancelled", () => {
    expect(canDeleteDoc("invoice", "draft")).toBe(true);
    expect(canDeleteDoc("invoice", "cancelled")).toBe(true);
    expect(canDeleteDoc("invoice", "paid")).toBe(false);
    expect(canDeleteDoc("delivery_note", "draft")).toBe(true);
    expect(canDeleteDoc("delivery_note", "delivered")).toBe(false);
  });

  it("always allows payment delete (balance restored by trigger)", () => {
    expect(canDeleteDoc("payment", null)).toBe(true);
    expect(canDeleteDoc("payment", "anything")).toBe(true);
  });
});
