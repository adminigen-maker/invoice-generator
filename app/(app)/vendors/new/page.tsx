import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { VendorForm } from "../vendor-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "New vendor" };

export default async function NewVendorPage() {
  if (!(await can(P.procurement.vendorCreate))) redirect("/vendors");
  const supabase = await createClient();
  const { data: taxes } = await supabase.from("tax_rate").select("id, code, name").order("code");

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">New vendor</h1>
      <Card>
        <CardContent className="pt-6">
          <VendorForm taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} — ${t.name}` }))} />
        </CardContent>
      </Card>
    </div>
  );
}
