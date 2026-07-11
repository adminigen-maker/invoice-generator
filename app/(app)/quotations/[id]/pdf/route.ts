import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { DocumentPdf, type DocLine } from "@/lib/pdf/document-pdf";
import { buildCompany, buildCustomer, taxLabel } from "@/lib/pdf/pdf-data";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.sales.quotationView);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: q }, { data: company }] = await Promise.all([
    supabase
      .from("quotation")
      .select(`
        *,
        customer:customer(name, tax_registration_number, addresses:customer_address(kind, line1, line2, city, region, country, is_default)),
        lines:quotation_line(sequence, description, quantity, unit_price, line_subtotal, line_discount, line_tax,
          uom:unit_of_measure(code), tax:tax_rate(rate))
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("company").select("*").maybeSingle(),
  ]);

  if (!q) return new NextResponse("Not found", { status: 404 });

  const lines: DocLine[] = ((q.lines ?? []) as Array<Record<string, unknown>>)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence))
    .map((l) => ({
      description: String(l.description ?? ""),
      quantity: Number(l.quantity ?? 0),
      uom: (l.uom as { code?: string } | null)?.code ?? "Units",
      unit_price: Number(l.unit_price ?? 0),
      tax_label: taxLabel((l.tax as { rate?: number } | null)?.rate),
      tax_amount: Number(l.line_tax ?? 0),
      amount: Number(l.line_subtotal ?? 0) - Number(l.line_discount ?? 0),
    }));

  const pdf = await renderToBuffer(
    DocumentPdf({
      documentTitle: "Quotation",
      documentNumber: q.number,
      documentDate: q.quote_date,
      paymentTerms: q.terms ?? undefined,
      company: buildCompany(company),
      customer: buildCustomer(q.customer),
      currency: q.currency,
      lines,
      totals: {
        untaxed: Number(q.subtotal) - Number(q.discount_total),
        tax: Number(q.tax_total),
        total: Number(q.total),
      },
      showTax: true,
    })
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${q.number}.pdf"`,
    },
  });
}
