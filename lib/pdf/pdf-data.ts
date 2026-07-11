import type { DocumentPdfProps } from "./document-pdf";

type AnyRec = Record<string, unknown> | null | undefined;

/** Map a company row to the PDF's company block. */
export function buildCompany(company: AnyRec): DocumentPdfProps["company"] {
  const c = (company ?? {}) as Record<string, unknown>;
  const cityCountry = [c.city, c.country].filter(Boolean).join(", ");
  return {
    name: (c.name as string) ?? "Company",
    addressLine1: (c.address_line1 as string) ?? undefined,
    cityCountry: cityCountry || undefined,
    trn: (c.tax_registration_number as string) ?? undefined,
    phone: (c.phone as string) ?? undefined,
    whatsapp: (c.whatsapp as string) ?? undefined,
    email: (c.email as string) ?? undefined,
    website: (c.website as string) ?? undefined,
    bankAccount: (c.bank_account as string) ?? undefined,
    logoUrl: (c.logo_url as string) ?? undefined,
  };
}

/** Map a customer (+ nested addresses) to the PDF's bill-to block. */
export function buildCustomer(customer: AnyRec): DocumentPdfProps["customer"] {
  const cu = (customer ?? {}) as Record<string, unknown>;
  const addresses = (cu.addresses ?? []) as Array<Record<string, unknown>>;
  const addr =
    addresses.find((a) => a.kind === "billing" && a.is_default) ||
    addresses.find((a) => a.kind === "billing") ||
    addresses.find((a) => a.is_default) ||
    addresses[0];
  const addressLines = addr
    ? [
        addr.line1 as string,
        addr.line2 as string,
        [addr.city, addr.region].filter(Boolean).join(" "),
        addr.country as string,
      ].filter(Boolean)
    : [];
  return {
    name: (cu.name as string) ?? "—",
    addressLines,
    trn: (cu.tax_registration_number as string) ?? undefined,
  };
}

/** Tax rate → column label. Blank for 0/none, matching the template. */
export function taxLabel(rate?: number | null): string {
  const r = Number(rate ?? 0);
  if (!r) return "";
  return `${Number.isInteger(r) ? r : r.toFixed(2)}%`;
}

/** Derive a human payment-terms label from the invoice/due dates. */
export function paymentTermsLabel(invoiceDate?: string | null, dueDate?: string | null): string {
  if (!dueDate || !invoiceDate) return "Immediate Payment";
  const inv = new Date(invoiceDate);
  const due = new Date(dueDate);
  const days = Math.round((due.getTime() - inv.getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return "Immediate Payment";
  return `${days} Days`;
}
