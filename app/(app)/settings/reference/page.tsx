import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { REF_TABLES, REF_ORDER } from "@/lib/reference-tables";
import { RefTable } from "./ref-table";

export const dynamic = "force-dynamic";

export default async function ReferenceDataPage() {
  const perms = await getPermissions();
  if (!perms.has("admin.company.edit") && !perms.has("inventory.product.edit")) redirect("/");

  const supabase = await createClient();
  const [{ data: categories }, { data: uoms }, { data: taxes }, { data: warehouses }] = await Promise.all([
    supabase.from("product_category").select("id, code, name, created_at").order("name"),
    supabase.from("unit_of_measure").select("id, code, name, category, created_at").order("code"),
    supabase.from("tax_rate").select("id, code, name, rate, created_at").order("code"),
    supabase.from("warehouse").select("id, code, name, address, created_at").order("code"),
  ]);

  const data: Record<string, unknown[]> = {
    product_category: categories ?? [],
    unit_of_measure: uoms ?? [],
    tax_rate: taxes ?? [],
    warehouse: warehouses ?? [],
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reference data</h1>
        <p className="text-sm text-muted-foreground">
          The lookup lists used across the app — add, rename or remove them here.
        </p>
      </div>

      {REF_ORDER.map((key) => {
        const cfg = REF_TABLES[key as string];
        return (
          <RefTable
            key={key}
            cfg={cfg}
            rows={(data[key as string] ?? []) as never}
            canEdit={perms.has(cfg.perms.edit)}
          />
        );
      })}
    </div>
  );
}
