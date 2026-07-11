import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/db/supabase-server";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();

  const [
    { count: quotationsCount },
    { count: ordersCount },
    { count: openInvoices },
    { data: totals },
  ] = await Promise.all([
    supabase.from("quotation").select("*", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("sales_order").select("*", { count: "exact", head: true }),
    supabase.from("invoice").select("*", { count: "exact", head: true }).neq("status", "paid"),
    // Aggregate in the DB (one scalar row) instead of streaming every invoice
    // and summing in JS. RLS-scoped via the SECURITY INVOKER dashboard_totals().
    supabase.rpc("dashboard_totals"),
  ]);

  const agg = (Array.isArray(totals) ? totals[0] : totals) as
    | { revenue?: number; outstanding?: number }
    | null
    | undefined;
  const revenue = Number(agg?.revenue ?? 0);
  const outstanding = Number(agg?.outstanding ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of the order-to-cash pipeline
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Draft quotations" value={String(quotationsCount ?? 0)} href="/quotations?status=draft" />
        <StatCard title="Sales orders"     value={String(ordersCount ?? 0)}     href="/sales-orders" />
        <StatCard title="Open invoices"    value={String(openInvoices ?? 0)}    href="/invoices?status=open" />
        <StatCard title="Outstanding"      value={formatMoney(outstanding)}     href="/invoices?status=open" tone="warn" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Getting started</CardTitle>
          <CardDescription>
            The system is scaffolded through the full Quotation → Invoice → Payment cycle.
            See <code className="rounded bg-muted px-1 py-0.5 text-xs">README.md</code> for setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="success">1</Badge>
            Seed a warehouse, tax config, and default sequences (already covered by migration 0008).
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">2</Badge>
            Create your first user via Supabase Auth, then assign the <code>admin</code> role.
          </div>
          <div className="flex items-center gap-2">
            <Badge>3</Badge>
            Add a product and a customer, then draft your first quotation.
          </div>
          <div className="mt-3 text-sm">
            Revenue booked to date: <span className="font-medium">{formatMoney(revenue)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  href,
  tone,
}: {
  title: string;
  value: string;
  href: string;
  tone?: "warn";
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <CardDescription>{title}</CardDescription>
          <CardTitle className={tone === "warn" ? "text-amber-700 dark:text-amber-400 text-2xl" : "text-2xl"}>
            {value}
          </CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}
