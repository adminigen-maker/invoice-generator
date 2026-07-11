import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { CustomerForm } from "../customer-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: customer }, { data: taxes }] = await Promise.all([
    supabase.from("customer").select("*").eq("id", id).maybeSingle(),
    supabase.from("tax_rate").select("id, code, name").order("code"),
  ]);
  if (!customer) return notFound();

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        {customer.name} <span className="text-muted-foreground text-lg font-normal">· {customer.code}</span>
      </h1>
      <Card>
        <CardContent className="pt-6">
          <CustomerForm initial={customer} taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} — ${t.name}` }))} />
        </CardContent>
      </Card>
    </div>
  );
}
