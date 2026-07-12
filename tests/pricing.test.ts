import { describe, it, expect } from "vitest";
import { computeLine, computeTotals } from "@/lib/pricing";

describe("computeLine", () => {
  it("computes a plain line (no discount, no tax)", () => {
    const t = computeLine({ quantity: 2, unit_price: 100, discount_pct: 0 });
    expect(t).toMatchObject({ line_subtotal: 200, line_discount: 0, line_taxable: 200, line_tax: 0, line_total: 200 });
  });

  it("applies 5% VAT", () => {
    const t = computeLine({ quantity: 2, unit_price: 100, discount_pct: 0, tax_rate: 5 });
    expect(t.line_tax).toBe(10);
    expect(t.line_total).toBe(210);
  });

  it("applies discount before tax", () => {
    const t = computeLine({ quantity: 2, unit_price: 100, discount_pct: 10, tax_rate: 5 });
    expect(t.line_discount).toBe(20);
    expect(t.line_taxable).toBe(180);
    expect(t.line_tax).toBe(9);
    expect(t.line_total).toBe(189);
  });

  it("backs tax out of a tax-inclusive price", () => {
    const t = computeLine({ quantity: 1, unit_price: 105, discount_pct: 0, tax_rate: 5, tax_inclusive: true });
    expect(t.line_taxable).toBe(100);
    expect(t.line_tax).toBe(5);
    expect(t.line_total).toBe(105);
  });

  it("coerces string inputs and treats junk as zero", () => {
    const t = computeLine({ quantity: "3", unit_price: "10.5", discount_pct: "", tax_rate: undefined });
    expect(t.line_subtotal).toBe(31.5);
    expect(t.line_total).toBe(31.5);
  });

  it("rounds to 2 decimals per line", () => {
    const t = computeLine({ quantity: 3, unit_price: 3.335, discount_pct: 0, tax_rate: 5 });
    // gross 10.005 -> rounded pieces
    expect(Number.isInteger(t.line_total * 100)).toBe(true);
  });
});

describe("computeTotals", () => {
  it("sums multiple lines", () => {
    const totals = computeTotals([
      { quantity: 2, unit_price: 100, discount_pct: 0, tax_rate: 5 }, // 200 + 10
      { quantity: 1, unit_price: 50, discount_pct: 10, tax_rate: 5 }, // 45 + 2.25
    ]);
    expect(totals.subtotal).toBe(250);
    expect(totals.discount_total).toBe(5);
    expect(totals.tax_total).toBe(12.25);
    expect(totals.total).toBe(257.25);
  });

  it("returns zeros for an empty document", () => {
    expect(computeTotals([])).toEqual({ subtotal: 0, discount_total: 0, tax_total: 0, total: 0 });
  });
});
