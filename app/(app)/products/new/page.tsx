import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { ProductForm } from "../product-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  if (!(await can(P.inventory.productCreate))) redirect("/products");

  const supabase = await createClient();
  const [{ data: uoms }, { data: taxes }, { data: categories }] = await Promise.all([
    supabase.from("unit_of_measure").select("id, code, name").order("code"),
    supabase.from("tax_rate").select("id, code, name").order("code"),
    supabase.from("product_category").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
      <Card>
        <CardContent className="pt-6">
          <ProductForm
            uoms={(uoms ?? []).map((u) => ({ id: u.id, label: `${u.code} — ${u.name}` }))}
            taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} — ${t.name}` }))}
            categories={(categories ?? []).map((c) => ({ id: c.id, label: c.name }))}
            canViewCost={await can(P.inventory.productViewCost)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
