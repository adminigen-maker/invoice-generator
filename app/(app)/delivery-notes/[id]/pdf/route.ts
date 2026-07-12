import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { DocumentPdf, type DocLine } from "@/lib/pdf/document-pdf";
import { buildCompany, buildCustomer } from "@/lib/pdf/pdf-data";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.inventory.deliveryView);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: dn }, { data: company }] = await Promise.all([
    supabase
      .from("delivery_note")
      .select(`
        *,
        sales_order:sales_order(number, customer:customer(name, tax_registration_number,
          addresses:customer_address(kind, line1, line2, city, region, country, is_default))),
        lines:delivery_note_line(quantity, product:product(name, sku), uom:unit_of_measure(code))
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("company").select("*").maybeSingle(),
  ]);

  if (!dn) return new NextResponse("Not found", { status: 404 });

  const so = dn.sales_order as { number?: string; customer?: Record<string, unknown> | null } | null;
  const lines: DocLine[] = ((dn.lines ?? []) as Array<Record<string, unknown>>).map((l) => ({
    description: (l.product as { name?: string } | null)?.name ?? "Item",
    quantity: Number(l.quantity ?? 0),
    uom: (l.uom as { code?: string } | null)?.code ?? "Units",
    unit_price: 0,
    tax_label: "",
    tax_amount: 0,
    amount: 0,
  }));

  const pdf = await renderToBuffer(
    DocumentPdf({
      documentTitle: "Delivery Note",
      documentNumber: dn.number,
      documentDate: dn.delivery_date,
      source: so?.number,
      company: buildCompany(company),
      customer: buildCustomer(so?.customer ?? null),
      currency: "AED",
      lines,
      totals: { untaxed: 0, tax: 0, total: 0 },
      showPrices: false,
      showTax: false,
    })
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${dn.number}.pdf"`,
    },
  });
}
