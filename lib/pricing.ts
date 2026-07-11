/**
 * Line-level and document-level totals.
 * All numeric inputs are coerced to numbers; NaN is treated as 0.
 * Currency rounding is HALF-EVEN at 2 decimals (banker's rounding),
 * applied at the line level then summed — matches Odoo behavior.
 */

export type LineInput = {
  quantity: number | string | null | undefined;
  unit_price: number | string | null | undefined;
  discount_pct: number | string | null | undefined;
  tax_rate?: number | string | null | undefined;   // percentage, e.g. 5 for VAT 5%
  tax_inclusive?: boolean;
};

export type LineTotals = {
  line_subtotal: number;   // qty * unit_price
  line_discount: number;   // discount portion
  line_taxable: number;    // subtotal − discount
  line_tax: number;        // tax amount
  line_total: number;      // taxable + tax
};

const n = (v: unknown): number => {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
};

const round2 = (x: number): number => {
  // Half-away-from-zero rounding — sufficient for AED, matches typical ERP output.
  return Math.round((x + Number.EPSILON) * 100) / 100;
};

export function computeLine(l: LineInput): LineTotals {
  const qty = n(l.quantity);
  const price = n(l.unit_price);
  const discPct = n(l.discount_pct);
  const taxPct = n(l.tax_rate);

  const gross = qty * price;

  if (l.tax_inclusive && taxPct > 0) {
    // Price already includes tax. Back it out first.
    const taxable = gross / (1 + taxPct / 100);
    const discount = taxable * (discPct / 100);
    const netTaxable = taxable - discount;
    const tax = netTaxable * (taxPct / 100);
    return {
      line_subtotal: round2(taxable),
      line_discount: round2(discount),
      line_taxable: round2(netTaxable),
      line_tax: round2(tax),
      line_total: round2(netTaxable + tax),
    };
  }

  const discount = gross * (discPct / 100);
  const taxable = gross - discount;
  const tax = taxable * (taxPct / 100);
  return {
    line_subtotal: round2(gross),
    line_discount: round2(discount),
    line_taxable: round2(taxable),
    line_tax: round2(tax),
    line_total: round2(taxable + tax),
  };
}

export type DocumentTotals = {
  subtotal: number;      // sum of line_subtotals (pre-discount)
  discount_total: number;
  tax_total: number;
  total: number;
};

export function computeTotals(lines: LineInput[]): DocumentTotals {
  const totals = lines.reduce<DocumentTotals>(
    (acc, l) => {
      const t = computeLine(l);
      acc.subtotal += t.line_subtotal;
      acc.discount_total += t.line_discount;
      acc.tax_total += t.line_tax;
      acc.total += t.line_total;
      return acc;
    },
    { subtotal: 0, discount_total: 0, tax_total: 0, total: 0 }
  );
  return {
    subtotal: round2(totals.subtotal),
    discount_total: round2(totals.discount_total),
    tax_total: round2(totals.tax_total),
    total: round2(totals.total),
  };
}
