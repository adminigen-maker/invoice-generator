import Link from "next/link";
import {
  AlertTriangle, Clock, Wallet, PackageX, Truck, FileCheck2, ShoppingCart, FileText, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/db/supabase-server";
import { formatMoney, formatDate } from "@/lib/utils";
import { RevenueTrendChart, StatusDonutChart, TopCustomersChart } from "@/components/charts/dashboard-charts";
import { CustomerFilter } from "@/components/customer-filter";

export const dynamic = "force-dynamic";

const currency = process.env.NEXT_PUBLIC_COMPANY_CURRENCY ?? "AED";
const rows = <T,>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : []);

type Ops = {
  overdue: { count: number; amount: number };
  due_soon: { count: number; amount: number };
  collected_month: number;
  draft_quotations: number;
  awaiting_delivery: number;
  awaiting_invoice: number;
  open_pos: number;
  low_stock: number;
  overdue_list: { id: string; number: string; customer: string; due_date: string; balance: number }[];
  low_stock_list: { sku: string; name: string; reorder_point: number; on_hand: number }[];
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  const customerId = customer || null;
  const supabase = await createClient();
  const [{ data: opsData }, { data: trend }, { data: statuses }, { data: topCustomers }, { data: customerList }] = await Promise.all([
    supabase.rpc("dashboard_operational", { p_customer: customerId }),
    supabase.rpc("revenue_by_month", { months: 6 }),
    supabase.rpc("invoice_status_counts"),
    supabase.rpc("top_customers", { lim: 5 }),
    supabase.from("customer").select("id, code, name").eq("is_active", true).order("name"),
  ]);
  const ops = (opsData as Ops | null) ?? null;

  const trendData = rows<{ month: string; invoiced: number; collected: number }>(trend).map((r) => ({
    month: r.month, invoiced: Number(r.invoiced), collected: Number(r.collected),
  }));
  const statusData = rows<{ status: string; count: number }>(statuses).map((r) => ({ status: r.status, count: Number(r.count) }));
  const customerData = rows<{ name: string; total: number }>(topCustomers).map((r) => ({ name: r.name, total: Number(r.total) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            What needs your attention today
            {customerId && " · filtered to one customer (open POs and low stock stay company-wide)"}
          </p>
        </div>
        <CustomerFilter customers={(customerList ?? []).map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))} />
      </div>

      {/* Actionable KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <OpsCard title="Overdue" value={formatMoney(ops?.overdue.amount ?? 0, currency)}
          sub={`${ops?.overdue.count ?? 0} invoice(s)`} icon={AlertTriangle} accent="red" href="/invoices" />
        <OpsCard title="Due this week" value={formatMoney(ops?.due_soon.amount ?? 0, currency)}
          sub={`${ops?.due_soon.count ?? 0} invoice(s)`} icon={Clock} accent="amber" href="/invoices" />
        <OpsCard title="Collected this month" value={formatMoney(ops?.collected_month ?? 0, currency)}
          sub="Payments received" icon={Wallet} accent="emerald" href="/payments" />
        <OpsCard title="Low stock" value={String(ops?.low_stock ?? 0)}
          sub="At/below reorder" icon={PackageX} accent="orange" href="/inventory" />
      </div>

      {/* Secondary counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MiniCard label="Awaiting delivery" value={ops?.awaiting_delivery ?? 0} icon={Truck} href="/sales-orders" />
        <MiniCard label="Awaiting invoicing" value={ops?.awaiting_invoice ?? 0} icon={FileCheck2} href="/sales-orders" />
        <MiniCard label="Open purchase orders" value={ops?.open_pos ?? 0} icon={ShoppingCart} href="/purchase-orders" />
        <MiniCard label="Draft quotations" value={ops?.draft_quotations ?? 0} icon={FileText} href="/quotations" />
      </div>

      {/* Action lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />Overdue invoices</CardTitle>
            <CardDescription>Chase these first</CardDescription>
          </CardHeader>
          <CardContent>
            {(ops?.overdue_list ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing overdue — nicely done. 🎉</p>
            ) : (
              <ul className="divide-y text-sm">
                {ops!.overdue_list.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-2 gap-2">
                    <div className="min-w-0">
                      <Link href={`/invoices/${i.id}`} className="font-mono text-xs text-blue-600 hover:text-blue-700">{i.number}</Link>
                      <div className="text-muted-foreground truncate">{i.customer}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono">{formatMoney(i.balance, currency)}</div>
                      <div className="text-xs text-destructive">due {formatDate(i.due_date)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><PackageX className="h-4 w-4 text-orange-500" />Low stock</CardTitle>
            <CardDescription>Reorder soon</CardDescription>
          </CardHeader>
          <CardContent>
            {(ops?.low_stock_list ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">All stocked items are above their reorder point.</p>
            ) : (
              <ul className="divide-y text-sm">
                {ops!.low_stock_list.map((s) => (
                  <li key={s.sku} className="flex items-center justify-between py-2 gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-muted-foreground font-mono text-xs">{s.sku}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-mono ${Number(s.on_hand) <= 0 ? "text-destructive" : "text-amber-600"}`}>{Number(s.on_hand).toFixed(0)}</div>
                      <div className="text-xs text-muted-foreground">reorder at {Number(s.reorder_point).toFixed(0)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend + status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Revenue trend</CardTitle>
                <CardDescription>Invoiced vs. collected · last 6 months</CardDescription>
              </div>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent><RevenueTrendChart data={trendData} currency={currency} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invoices by status</CardTitle>
            <CardDescription>Across the lifecycle</CardDescription>
          </CardHeader>
          <CardContent><StatusDonutChart data={statusData} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top customers</CardTitle>
          <CardDescription>By total invoiced</CardDescription>
        </CardHeader>
        <CardContent><TopCustomersChart data={customerData} currency={currency} /></CardContent>
      </Card>
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
};

function OpsCard({ title, value, sub, href, icon: Icon, accent }: {
  title: string; value: string; sub: string; href: string;
  icon: React.ComponentType<{ className?: string }>; accent: keyof typeof ACCENTS;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md hover:border-foreground/20 transition-all h-full">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className={`h-8 w-8 rounded-lg grid place-items-center ${ACCENTS[accent]}`}><Icon className="h-4 w-4" /></div>
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight truncate">{value}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MiniCard({ label, value, href, icon: Icon }: {
  label: string; value: number; href: string; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md hover:border-foreground/20 transition-all h-full">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg grid place-items-center bg-muted text-muted-foreground shrink-0"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="text-xl font-semibold">{value}</div>
            <div className="text-xs text-muted-foreground truncate">{label}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
