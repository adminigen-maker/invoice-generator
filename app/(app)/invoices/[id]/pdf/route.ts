import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { DocumentPdf, type DocLine } from "@/lib/pdf/document-pdf";
import { buildCompany, buildCustomer, taxLabel, paymentTermsLabel } from "@/lib/pdf/pdf-data";

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.invoice.view);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: inv }, { data: company }, { data: creditLines }, { data: creditNotes }] = await Promise.all([
    supabase
      .from("invoice")
      .select(`
        *,
        customer:customer(name, tax_registration_number, addresses:customer_address(kind, line1, line2, city, region, country, is_default)),
        sales_order:sales_order(number),
        lines:invoice_line(id, sequence, description, quantity, unit_price, line_subtotal, line_discount, line_tax,
          uom:unit_of_measure(code), tax:tax_rate(rate))
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("company").select("*").maybeSingle(),
    supabase
      .from("credit_note_line")
      .select("invoice_line_id, quantity, credit_note:credit_note!inner(invoice_id, status)")
      .eq("credit_note.invoice_id", id)
      .neq("credit_note.status", "cancelled"),
    supabase.from("credit_note").select("number, status").eq("invoice_id", id).neq("status", "cancelled"),
  ]);

  if (!inv) return new NextResponse("Not found", { status: 404 });

  // Returned quantity per invoice line, so the printed invoice shows what the
  // customer actually keeps (net of returns) rather than the original order.
  const returnedByLine = new Map<string, number>();
  for (const cl of (creditLines ?? []) as Array<{ invoice_line_id: string | null; quantity: number }>) {
    if (cl.invoice_line_id) returnedByLine.set(cl.invoice_line_id, (returnedByLine.get(cl.invoice_line_id) ?? 0) + Number(cl.quantity));
  }

  let untaxed = 0;
  let taxTotal = 0;
  const lines: DocLine[] = ((inv.lines ?? []) as Array<Record<string, unknown>>)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence))
    .map((l) => {
      const qty = Number(l.quantity ?? 0);
      const returned = returnedByLine.get(String(l.id)) ?? 0;
      const netQty = qty - returned;
      const ratio = qty > 0 ? netQty / qty : 0;
      const amount = round2((Number(l.line_subtotal ?? 0) - Number(l.line_discount ?? 0)) * ratio);
      const tax = round2(Number(l.line_tax ?? 0) * ratio);
      untaxed += amount;
      taxTotal += tax;
      return {
        description: String(l.description ?? ""),
        quantity: netQty,
        uom: (l.uom as { code?: string } | null)?.code ?? "Units",
        unit_price: Number(l.unit_price ?? 0),
        tax_label: taxLabel((l.tax as { rate?: number } | null)?.rate),
        tax_amount: tax,
        amount,
        _net: netQty,
      } as DocLine & { _net: number };
    })
    // A fully returned line is dropped from the printed invoice.
    .filter((l) => (l as DocLine & { _net: number })._net > 0.0001)
    .map(({ ...l }) => {
      delete (l as Partial<DocLine & { _net: number }>)._net;
      return l as DocLine;
    });

  const cnNumbers = ((creditNotes ?? []) as Array<{ number: string }>).map((c) => c.number);
  const note = cnNumbers.length
    ? `Net of returns — credit note${cnNumbers.length > 1 ? "s" : ""} ${cnNumbers.join(", ")} applied.`
    : undefined;

  const pdf = await renderToBuffer(
    DocumentPdf({
      documentTitle: "TAX Invoice",
      documentNumber: inv.number,
      documentDate: inv.invoice_date,
      dueDate: inv.due_date ?? undefined,
      source: (inv.sales_order as { number?: string } | null)?.number,
      paymentTerms: paymentTermsLabel(inv.invoice_date, inv.due_date),
      paymentCommunication: inv.number,
      company: buildCompany(company),
      customer: buildCustomer(inv.customer),
      currency: inv.currency,
      lines,
      totals: {
        untaxed: round2(untaxed),
        tax: round2(taxTotal),
        total: round2(untaxed + taxTotal),
      },
      showTax: true,
      note,
    })
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.number}.pdf"`,
    },
  });
}
