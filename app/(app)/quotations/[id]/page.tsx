import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { QuotationForm } from "../quotation-form";
import { StatusBadge } from "@/components/status-badge";
import { StatusOverride } from "@/components/status-override";
import { PdfButton } from "@/components/pdf-button";
import { Card, CardContent } from "@/components/ui/card";

export default async function ViewQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: quotation },
    { data: customers },
    { data: products },
    { data: uoms },
    { data: taxes },
    { data: stock },
  ] = await Promise.all([
    supabase.from("quotation")
      .select("*, lines:quotation_line(product_id, description, quantity, uom_id, unit_price, discount_pct, tax_id, sequence)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("customer").select("id, code, name").order("name"),
    supabase.from("product").select("id, sku, name, sale_price, uom_id, tax_id").order("name"),
    supabase.from("unit_of_measure").select("id, code").order("code"),
    supabase.from("tax_rate").select("id, code, name, rate").order("code"),
    supabase.rpc("stock_on_hand"),
  ]);
  const stockMap = new Map(((stock as { product_id: string; on_hand: number }[] | null) ?? []).map((s) => [s.product_id, Number(s.on_hand)]));

  if (!quotation) return notFound();
  const lines = (quotation.lines ?? []).sort(
    (a: { sequence: number }, b: { sequence: number }) => a.sequence - b.sequence
  );

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {quotation.number}
            <StatusBadge status={quotation.status} />
          </h1>
        </div>
        <div className="flex gap-2">
          <PdfButton url={`/quotations/${id}/pdf`} filename={`${quotation.number}.pdf`} />
        </div>
      </div>

      {(await can(P.admin.statusOverride)) && <StatusOverride entity="quotation" id={quotation.id} current={quotation.status} />}

      <Card>
        <CardContent className="pt-6">
          <QuotationForm
            initial={{
              id: quotation.id,
              customer_id: quotation.customer_id,
              quote_date: quotation.quote_date,
              valid_until: quotation.valid_until,
              currency: quotation.currency,
              notes: quotation.notes,
              terms: quotation.terms,
              status: quotation.status,
              lines,
            }}
            customers={(customers ?? []).map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
            products={(products ?? []).map((p) => ({
              id: p.id,
              label: `${p.sku} — ${p.name}`,
              extra: { sale_price: p.sale_price, uom_id: p.uom_id, tax_id: p.tax_id, stock: stockMap.get(p.id) ?? null },
            }))}
            uoms={(uoms ?? []).map((u) => ({ id: u.id, label: u.code }))}
            taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} (${Number(t.rate).toFixed(2)}%)`, extra: { rate: t.rate } }))}
            canConfirm={await can(P.sales.quotationConfirm)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
