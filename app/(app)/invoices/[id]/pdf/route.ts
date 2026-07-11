import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { DocumentPdf } from "@/lib/pdf/document-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.invoice.view);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: inv }, { data: company }] = await Promise.all([
    supabase.from("invoice").select(`
      *,
      customer:customer(name, tax_registration_number),
      lines:invoice_line(description, quantity, unit_price, discount_pct, line_total, tax:tax_rate(code, rate))
    `).eq("id", id).maybeSingle(),
    supabase.from("company").select("*").maybeSingle(),
  ]);
  if (!inv) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderToBuffer(
    DocumentPdf({
      documentTitle: "TAX INVOICE",
      documentNumber: inv.number,
      documentDate: inv.invoice_date,
      dueDate: inv.due_date ?? undefined,
      company: {
        name: company?.name ?? "Company",
        address: [company?.address_line1, company?.address_line2, company?.city, company?.country].filter(Boolean).join(", "),
        trn: company?.tax_registration_number ?? undefined,
        email: company?.email ?? undefined,
        phone: company?.phone ?? undefined,
      },
      customer: {
        name: (inv.customer as { name?: string } | null)?.name ?? "—",
        trn: (inv.customer as { tax_registration_number?: string } | null)?.tax_registration_number ?? undefined,
      },
      currency: inv.currency,
      lines: (inv.lines ?? []).map((l: {
        description: string; quantity: number; unit_price: number; discount_pct: number; line_total: number;
        tax?: { code?: string; rate?: number } | null;
      }) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount_pct: Number(l.discount_pct),
        line_total: Number(l.line_total),
        tax_label: l.tax?.code ? `${l.tax.code} ${Number(l.tax.rate).toFixed(0)}%` : undefined,
      })),
      totals: {
        subtotal: Number(inv.subtotal),
        discount_total: Number(inv.discount_total),
        tax_total: Number(inv.tax_total),
        total: Number(inv.total),
      },
      notes: inv.notes ?? undefined,
      terms: inv.terms ?? undefined,
    })
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.number}.pdf"`,
    },
  });
}
