import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { QuotationForm } from "../quotation-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "New quotation" };

export default async function NewQuotationPage() {
  if (!(await can(P.sales.quotationCreate))) redirect("/quotations");

  const supabase = await createClient();
  const [
    { data: customers },
    { data: products },
    { data: uoms },
    { data: taxes },
    { data: stock },
  ] = await Promise.all([
    supabase.from("customer").select("id, code, name, default_tax_id").eq("is_active", true).order("name"),
    supabase.from("product").select("id, sku, name, sale_price, uom_id, tax_id").eq("is_active", true).order("name"),
    supabase.from("unit_of_measure").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("tax_rate").select("id, code, name, rate").eq("is_active", true).order("code"),
    supabase.rpc("stock_on_hand"),
  ]);
  const stockMap = new Map(((stock as { product_id: string; on_hand: number }[] | null) ?? []).map((s) => [s.product_id, Number(s.on_hand)]));

  return (
    <div className="space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">New quotation</h1>
      <Card>
        <CardContent className="pt-6">
          <QuotationForm
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
