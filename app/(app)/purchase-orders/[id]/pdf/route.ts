import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { DocumentPdf, type DocLine } from "@/lib/pdf/document-pdf";
import { buildCompany, taxLabel } from "@/lib/pdf/pdf-data";

/**
 * Purchase order PDF. Reuses the shared document template, with our own company
 * in the header and the VENDOR as the addressee. PO lines carry tax as a free
 * percentage (tax_pct), so we label the VAT column from that directly.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.procurement.poView);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: po }, { data: company }] = await Promise.all([
    supabase
      .from("purchase_order")
      .select(`
        *,
        vendor:vendor(name, legal_name, tax_registration_number, email, phone, payment_terms_days),
        lines:purchase_order_line(sequence, description, quantity, unit_price, discount_pct, tax_pct,
          line_subtotal, line_discount, line_tax, uom:unit_of_measure(code))
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("company").select("*").maybeSingle(),
  ]);

  if (!po) return new NextResponse("Not found", { status: 404 });

  const lines: DocLine[] = ((po.lines ?? []) as Array<Record<string, unknown>>)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence))
    .map((l) => ({
      description: String(l.description ?? ""),
      quantity: Number(l.quantity ?? 0),
      uom: (l.uom as { code?: string } | null)?.code ?? "Units",
      unit_price: Number(l.unit_price ?? 0),
      tax_label: taxLabel(Number(l.tax_pct ?? 0)),
      tax_amount: Number(l.line_tax ?? 0),
      amount: Number(l.line_subtotal ?? 0) - Number(l.line_discount ?? 0),
    }));

  const vendor = (po.vendor ?? {}) as Record<string, unknown>;
  const vendorParty = {
    name: (vendor.name as string) ?? "—",
    addressLines: [vendor.legal_name, vendor.phone, vendor.email].filter(Boolean) as string[],
    trn: (vendor.tax_registration_number as string) ?? undefined,
  };

  const pdf = await renderToBuffer(
    DocumentPdf({
      documentTitle: "Purchase Order",
      documentNumber: po.number,
      documentDate: po.order_date,
      paymentTerms: vendor.payment_terms_days != null ? `${vendor.payment_terms_days} Days` : undefined,
      company: buildCompany(company),
      customer: vendorParty,
      currency: po.currency,
      lines,
      totals: {
        untaxed: Number(po.subtotal) - Number(po.discount_total),
        tax: Number(po.tax_total),
        total: Number(po.total),
      },
      showTax: true,
    })
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${po.number}.pdf"`,
    },
  });
}
