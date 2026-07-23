import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { previewDocumentNumber } from "@/lib/document-number";
import { InvoiceForm } from "../invoice-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  if (!(await can(P.invoice.create))) redirect("/invoices");

  const supabase = await createClient();
  const [
    { data: customers },
    { data: products },
    { data: uoms },
    { data: taxes },
    { data: stock },
    { data: seq },
  ] = await Promise.all([
    supabase.from("customer").select("id, code, name, default_tax_id").eq("is_active", true).order("name"),
    supabase.from("product").select("id, sku, name, sale_price, uom_id, tax_id").eq("is_active", true).order("name"),
    supabase.from("unit_of_measure").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("tax_rate").select("id, code, name, rate").eq("is_active", true).order("code"),
    supabase.rpc("stock_on_hand"),
    supabase.from("document_sequence").select("prefix, format, padding, next_number").eq("code", "invoice").maybeSingle(),
  ]);
  const stockMap = new Map(((stock as { product_id: string; on_hand: number }[] | null) ?? []).map((s) => [s.product_id, Number(s.on_hand)]));
  const numberPreview = seq
    ? previewDocumentNumber(seq.prefix, seq.format, seq.padding, seq.next_number)
    : "Auto-generated on save";

  return (
    <div className="space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">New invoice</h1>
      <p className="text-sm text-muted-foreground">Creates a draft invoice. Posting it later issues stock and finalizes the receivable.</p>
      <Card>
        <CardContent className="pt-6">
          <InvoiceForm
            numberPreview={numberPreview}
            customers={(customers ?? []).map((c) => ({ id: c.id, label: `${c.code} — ${c.name}`, extra: { tax_id: c.default_tax_id } }))}
            products={(products ?? []).map((p) => ({
              id: p.id,
              label: `${p.sku} — ${p.name}`,
              extra: { sale_price: p.sale_price, uom_id: p.uom_id, tax_id: p.tax_id, stock: stockMap.get(p.id) ?? null },
            }))}
            uoms={(uoms ?? []).map((u) => ({ id: u.id, label: u.code }))}
            taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} (${Number(t.rate).toFixed(2)}%)`, extra: { rate: t.rate } }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
