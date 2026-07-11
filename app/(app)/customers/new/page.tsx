import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { CustomerForm } from "../customer-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  if (!(await can(P.sales.customerCreate))) redirect("/customers");
  const supabase = await createClient();
  const { data: taxes } = await supabase.from("tax_rate").select("id, code, name").order("code");

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">New customer</h1>
      <Card>
        <CardContent className="pt-6">
          <CustomerForm taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} — ${t.name}` }))} />
        </CardContent>
      </Card>
    </div>
  );
}
