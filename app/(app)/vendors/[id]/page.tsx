import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { VendorForm } from "../vendor-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: vendor }, { data: taxes }] = await Promise.all([
    supabase.from("vendor").select("*").eq("id", id).maybeSingle(),
    supabase.from("tax_rate").select("id, code, name").order("code"),
  ]);
  if (!vendor) return notFound();

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        {vendor.name} <span className="text-muted-foreground text-lg font-normal">· {vendor.code}</span>
      </h1>
      <Card>
        <CardContent className="pt-6">
          <VendorForm initial={vendor} taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} — ${t.name}` }))} />
        </CardContent>
      </Card>
    </div>
  );
}
