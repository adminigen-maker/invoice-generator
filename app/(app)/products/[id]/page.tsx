import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { maskFields } from "@/lib/rbac/field-filter";
import { ProductForm } from "../product-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await can(P.inventory.productView))) redirect("/");

  const supabase = await createClient();
  const [{ data: product }, { data: uoms }, { data: taxes }, { data: categories }] = await Promise.all([
    supabase.from("product").select("*").eq("id", id).maybeSingle(),
    supabase.from("unit_of_measure").select("id, code, name").order("code"),
    supabase.from("tax_rate").select("id, code, name").order("code"),
    supabase.from("product_category").select("id, name").order("name"),
  ]);

  if (!product) return notFound();
  const masked = (await maskFields("product", product)) as typeof product;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        {product.name} <span className="text-muted-foreground text-lg font-normal">· {product.sku}</span>
      </h1>
      <Card>
        <CardContent className="pt-6">
          <ProductForm
            initial={masked ?? undefined}
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
