import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { PurchaseOrderForm } from "../po-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  if (!(await can(P.procurement.poCreate))) redirect("/purchase-orders");
  const supabase = await createClient();
  const [{ data: vendors }, { data: products }, { data: uoms }, { data: warehouses }, { data: taxes }] = await Promise.all([
    supabase.from("vendor").select("id, code, name").eq("is_active", true).order("name"),
    supabase.from("product").select("id, sku, name, cost_price, uom_id").eq("is_active", true).order("name"),
    supabase.from("unit_of_measure").select("id, code").eq("is_active", true).order("code"),
    supabase.from("warehouse").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("tax_rate").select("id, code, rate").eq("is_active", true).order("code"),
  ]);

  return (
    <div className="space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">New purchase order</h1>
      <Card>
        <CardContent className="pt-6">
          <PurchaseOrderForm
            vendors={(vendors ?? []).map((v) => ({ id: v.id, label: `${v.code} — ${v.name}` }))}
            products={(products ?? []).map((p) => ({ id: p.id, label: `${p.sku} — ${p.name}`, extra: { cost_price: p.cost_price, uom_id: p.uom_id } }))}
            uoms={(uoms ?? []).map((u) => ({ id: u.id, label: u.code }))}
            warehouses={(warehouses ?? []).map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` }))}
            taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} (${Number(t.rate).toFixed(2)}%)` }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
