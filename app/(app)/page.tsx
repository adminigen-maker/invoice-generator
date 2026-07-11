import Link from "next/link";
import {
  FileText,
  ClipboardList,
  Receipt,
  CircleDollarSign,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/db/supabase-server";
import { formatMoney } from "@/lib/utils";
import {
  RevenueTrendChart,
  StatusDonutChart,
  TopCustomersChart,
} from "@/components/charts/dashboard-charts";

export const dynamic = "force-dynamic";

const currency = process.env.NEXT_PUBLIC_COMPANY_CURRENCY ?? "AED";

type Row = Record<string, unknown>;
const rows = <T,>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : []);

export default async function Dashboard() {
  const supabase = await createClient();

  const [
    { count: quotationsCount },
    { count: ordersCount },
    { count: openInvoices },
    { data: totals },
    { data: trend },
    { data: statuses },
    { data: topCustomers },
  ] = await Promise.all([
    supabase.from("quotation").select("*", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("sales_order").select("*", { count: "exact", head: true }),
    supabase.from("invoice").select("*", { count: "exact", head: true }).neq("status", "paid"),
    supabase.rpc("dashboard_totals"),
    supabase.rpc("revenue_by_month", { months: 6 }),
    supabase.rpc("invoice_status_counts"),
    supabase.rpc("top_customers", { lim: 5 }),
  ]);

  const agg = (Array.isArray(totals) ? totals[0] : totals) as
    | { revenue?: number; outstanding?: number }
    | null
    | undefined;
  const revenue = Number(agg?.revenue ?? 0);
  const outstanding = Number(agg?.outstanding ?? 0);

  const trendData = rows<{ month: string; invoiced: number; collected: number }>(trend).map((r) => ({
    month: r.month,
    invoiced: Number(r.invoiced),
    collected: Number(r.collected),
  }));
  const statusData = rows<{ status: string; count: number }>(statuses).map((r) => ({
    status: r.status,
    count: Number(r.count),
  }));
  const customerData = rows<{ name: string; total: number }>(topCustomers).map((r) => ({
    name: r.name,
    total: Number(r.total),
  }));

  const hasData = statusData.length > 0 || revenue > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Snapshot of the order-to-cash pipeline</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Draft quotations" value={String(quotationsCount ?? 0)} href="/quotations" icon={FileText} accent="sky" />
        <StatCard title="Sales orders" value={String(ordersCount ?? 0)} href="/sales-orders" icon={ClipboardList} accent="indigo" />
        <StatCard title="Open invoices" value={String(openInvoices ?? 0)} href="/invoices" icon={Receipt} accent="violet" />
        <StatCard title="Outstanding" value={formatMoney(outstanding, currency)} href="/invoices" icon={CircleDollarSign} accent="amber" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Revenue trend</CardTitle>
                <CardDescription>Invoiced vs. collected · last 6 months</CardDescription>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                  <TrendingUp className="h-3.5 w-3.5" /> Collected
                </div>
                <div className="text-lg font-semibold">{formatMoney(revenue, currency)}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={trendData} currency={currency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invoices by status</CardTitle>
            <CardDescription>Distribution across the lifecycle</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusDonutChart data={statusData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top customers</CardTitle>
            <CardDescription>By total invoiced</CardDescription>
          </CardHeader>
          <CardContent>
            <TopCustomersChart data={customerData} currency={currency} />
          </CardContent>
        </Card>

        {!hasData && (
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Getting started</CardTitle>
              <CardDescription>Your charts fill in as you use the system</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p>1. Add a <Link href="/products/new" className="text-foreground underline">product</Link> and a <Link href="/customers/new" className="text-foreground underline">customer</Link>.</p>
              <p>2. Draft a <Link href="/quotations/new" className="text-foreground underline">quotation</Link> and confirm it to a sales order.</p>
              <p>3. Raise a delivery note, then an invoice, then record a payment.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

function StatCard({
  title,
  value,
  href,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md hover:border-foreground/20 transition-all h-full">
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${ACCENTS[accent]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">{title}</div>
            <div className="text-xl font-semibold truncate">{value}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
