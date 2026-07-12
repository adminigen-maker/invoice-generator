import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatMoney, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportsToolbar } from "@/components/reports-toolbar";

export const dynamic = "force-dynamic";

type Reports = {
  totals: { invoice_count: number; revenue: number; collected: number; outstanding: number };
  ar_aging: { not_due: number; d1_30: number; d31_60: number; d60_plus: number };
  top_products: { name: string; revenue: number; qty: number }[];
  top_customers: { name: string; revenue: number; invoices: number }[];
  revenue_by_month: { month: string; revenue: number }[];
};

type Vat = {
  output: { taxable: number; vat: number; count: number };
  input: { taxable: number; vat: number; count: number };
  by_rate: { code: string; rate: number; taxable: number; vat: number }[];
  invoices: { number: string; invoice_date: string; customer: string; taxable: number; vat: number; total: number }[];
};

type Valuation = {
  items: { sku: string; name: string; category: string; uom: string; on_hand: number; cost: number; value: number }[];
  total_value: number;
  total_lines: number;
};

type Profit = {
  totals: { revenue: number; cost: number; profit: number };
  by_product: { name: string; qty: number; revenue: number; cost: number; profit: number }[];
  by_customer: { name: string; revenue: number; cost: number; profit: number }[];
};

const marginPct = (revenue: number, profit: number) => (Number(revenue) ? (Number(profit) / Number(revenue)) * 100 : 0);

function toCsv(r: Reports, vat: Vat | null, profit: Profit | null, valuation: Valuation | null, from?: string, to?: string): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(`Invoice UAE — Report`);
  lines.push(`Period,${from || "all time"},${to || "today"}`);
  lines.push("");
  if (profit) {
    lines.push("Profitability,Revenue (net),COGS,Gross profit");
    lines.push(`Totals,${profit.totals.revenue},${profit.totals.cost},${profit.totals.profit}`);
    lines.push("");
    lines.push("Profit by product,Qty,Revenue,Cost,Profit");
    profit.by_product.forEach((p) => lines.push(`${esc(p.name)},${p.qty},${p.revenue},${p.cost},${p.profit}`));
    lines.push("");
  }
  if (valuation) {
    lines.push("Stock valuation,On hand,Cost,Value");
    valuation.items.forEach((v) => lines.push(`${esc(v.name)},${v.on_hand},${v.cost},${v.value}`));
    lines.push(`Total stock value,,,${valuation.total_value}`);
    lines.push("");
  }
  if (vat) {
    const net = Number(vat.output.vat) - Number(vat.input.vat);
    lines.push("VAT summary,Taxable,VAT");
    lines.push(`Output VAT (sales),${vat.output.taxable},${vat.output.vat}`);
    lines.push(`Input VAT (purchases),${vat.input.taxable},${vat.input.vat}`);
    lines.push(`Net VAT payable,,${net}`);
    lines.push("");
    lines.push("VAT by rate,Rate %,Taxable,VAT");
    vat.by_rate.forEach((b) => lines.push(`${esc(b.code)},${Number(b.rate)},${b.taxable},${b.vat}`));
    lines.push("");
  }
  lines.push("Totals");
  lines.push(`Invoices,${r.totals.invoice_count}`);
  lines.push(`Revenue,${r.totals.revenue}`);
  lines.push(`Collected,${r.totals.collected}`);
  lines.push(`Outstanding,${r.totals.outstanding}`);
  lines.push("");
  lines.push("AR aging,Amount");
  lines.push(`Not due,${r.ar_aging.not_due}`);
  lines.push(`1-30 days,${r.ar_aging.d1_30}`);
  lines.push(`31-60 days,${r.ar_aging.d31_60}`);
  lines.push(`60+ days,${r.ar_aging.d60_plus}`);
  lines.push("");
  lines.push("Top customers,Invoices,Revenue");
  r.top_customers.forEach((c) => lines.push(`${esc(c.name)},${c.invoices},${c.revenue}`));
  lines.push("");
  lines.push("Top products,Qty,Revenue");
  r.top_products.forEach((p) => lines.push(`${esc(p.name)},${p.qty},${p.revenue}`));
  lines.push("");
  lines.push("Month,Revenue");
  r.revenue_by_month.forEach((m) => lines.push(`${m.month},${m.revenue}`));
  return lines.join("\n");
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  if (!(await can(P.invoice.view))) redirect("/");
  const { from, to } = await searchParams;

  const supabase = await createClient();
  const showCost = await can(P.inventory.productViewCost);
  const [{ data }, { data: vatData }] = await Promise.all([
    supabase.rpc("reports_summary", { from_date: from ?? null, to_date: to ?? null }),
    supabase.rpc("vat_report", { from_date: from ?? null, to_date: to ?? null }),
  ]);
  const r = (data as Reports | null) ?? null;
  const vat = (vatData as Vat | null) ?? null;

  // Cost/profit is sensitive — only fetched for roles allowed to see cost price.
  const [{ data: profitData }, { data: valData }] = showCost
    ? await Promise.all([
        supabase.rpc("profit_report", { from_date: from ?? null, to_date: to ?? null }),
        supabase.rpc("stock_valuation"),
      ])
    : [{ data: null }, { data: null }];
  const profit = (profitData as Profit | null) ?? null;
  const valuation = (valData as Valuation | null) ?? null;

  if (!r) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No report data available.</CardContent></Card>
      </div>
    );
  }

  const aging = [
    { label: "Not yet due", value: r.ar_aging.not_due, color: "bg-emerald-500" },
    { label: "1–30 days", value: r.ar_aging.d1_30, color: "bg-amber-500" },
    { label: "31–60 days", value: r.ar_aging.d31_60, color: "bg-orange-500" },
    { label: "60+ days", value: r.ar_aging.d60_plus, color: "bg-red-500" },
  ];
  const agingTotal = aging.reduce((s, a) => s + Number(a.value), 0);
  const maxMonth = Math.max(1, ...r.revenue_by_month.map((m) => Number(m.revenue)));
  const maxProduct = Math.max(1, ...r.top_products.map((p) => Number(p.revenue)));
  const netVat = vat ? Number(vat.output.vat) - Number(vat.input.vat) : 0;

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Sales, receivables and product performance. Filter by date and export.</p>
      </div>

      <ReportsToolbar csv={toCsv(r, vat, profit, valuation, from, to)} filename={`report-${from || "all"}-${to || "today"}.csv`} />

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Invoiced (total)" value={formatMoney(r.totals.revenue)} />
        <Stat label="Collected" value={formatMoney(r.totals.collected)} tone="success" />
        <Stat label="Outstanding" value={formatMoney(r.totals.outstanding)} tone={r.totals.outstanding > 0 ? "danger" : undefined} />
        <Stat label="Invoices" value={String(r.totals.invoice_count)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* AR aging */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Accounts receivable aging</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agingTotal === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing outstanding — all invoices are paid.</p>
            ) : (
              aging.map((a) => {
                const pct = agingTotal > 0 ? (Number(a.value) / agingTotal) * 100 : 0;
                return (
                  <div key={a.label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{a.label}</span>
                      <span className="font-mono">{formatMoney(a.value)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${a.color}`} style={{ width: `${Math.max(pct, a.value > 0 ? 3 : 0)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Revenue by month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue — last 12 months</CardTitle>
          </CardHeader>
          <CardContent>
            {r.revenue_by_month.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices in the last 12 months.</p>
            ) : (
              <div className="space-y-2">
                {r.revenue_by_month.map((m) => (
                  <div key={m.month} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0 text-muted-foreground font-mono text-xs">{m.month}</span>
                    <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                      <div className="h-full rounded bg-primary" style={{ width: `${(Number(m.revenue) / maxMonth) * 100}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right font-mono text-xs">{formatMoney(m.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top products */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top products by revenue</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {r.top_products.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No sales yet.</TableCell></TableRow>
                )}
                {r.top_products.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {p.name}
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[180px]">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${(Number(p.revenue) / maxProduct) * 100}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{Number(p.qty).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top customers */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top customers by revenue</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Invoices</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {r.top_customers.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No sales yet.</TableCell></TableRow>
                )}
                {r.top_customers.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right font-mono">{c.invoices}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(c.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* VAT summary (UAE) */}
      {vat && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">VAT summary (UAE)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Output VAT · sales</div>
                <div className="mt-1 text-2xl font-semibold font-mono">{formatMoney(vat.output.vat)}</div>
                <div className="text-xs text-muted-foreground mt-1">Taxable {formatMoney(vat.output.taxable)} · {vat.output.count} inv.</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Input VAT · purchases</div>
                <div className="mt-1 text-2xl font-semibold font-mono">{formatMoney(vat.input.vat)}</div>
                <div className="text-xs text-muted-foreground mt-1">Taxable {formatMoney(vat.input.taxable)} · {vat.input.count} PO</div>
              </div>
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Net VAT payable</div>
                <div className={`mt-1 text-2xl font-semibold font-mono ${netVat > 0 ? "text-destructive" : "text-emerald-600"}`}>{formatMoney(netVat)}</div>
                <div className="text-xs text-muted-foreground mt-1">Output − Input</div>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Output VAT by rate</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rate</TableHead>
                    <TableHead className="text-right">Rate %</TableHead>
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vat.by_rate.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No sales in this period.</TableCell></TableRow>
                  )}
                  {vat.by_rate.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{b.code}</TableCell>
                      <TableCell className="text-right font-mono">{Number(b.rate).toFixed(2)}%</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(b.taxable)}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(b.vat)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {vat.invoices.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium select-none">
                  Invoice detail ({vat.invoices.length}) <span className="text-muted-foreground font-normal">— click to expand</span>
                </summary>
                <div className="mt-2 max-h-96 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Taxable</TableHead>
                        <TableHead className="text-right">VAT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vat.invoices.map((iv, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{iv.number}</TableCell>
                          <TableCell>{iv.customer}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(iv.invoice_date)}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(iv.taxable)}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(iv.vat)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Profitability (only for roles that can see cost) */}
      {profit && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Profitability</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label="Revenue (net)" value={formatMoney(profit.totals.revenue)} />
              <Tile label="Cost (COGS)" value={formatMoney(profit.totals.cost)} />
              <Tile label="Gross profit" value={formatMoney(profit.totals.profit)} tone={Number(profit.totals.profit) >= 0 ? "success" : "danger"} />
              <Tile label="Margin" value={`${marginPct(profit.totals.revenue, profit.totals.profit).toFixed(1)}%`} tone={Number(profit.totals.profit) >= 0 ? "success" : "danger"} />
            </div>
            <p className="text-xs text-muted-foreground">Profit uses each product&apos;s current cost price (standard cost). Service / no-product lines carry no cost.</p>
            <div className="grid lg:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium mb-2">By product</div>
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {profit.by_product.length === 0 && (<TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No sales in this period.</TableCell></TableRow>)}
                    {profit.by_product.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatMoney(p.revenue)}</TableCell>
                        <TableCell className={`text-right font-mono ${Number(p.profit) < 0 ? "text-destructive" : ""}`}>{formatMoney(p.profit)}</TableCell>
                        <TableCell className="text-right font-mono">{marginPct(p.revenue, p.profit).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">By customer</div>
                <Table>
                  <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {profit.by_customer.length === 0 && (<TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No sales in this period.</TableCell></TableRow>)}
                    {profit.by_customer.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatMoney(c.revenue)}</TableCell>
                        <TableCell className={`text-right font-mono ${Number(c.profit) < 0 ? "text-destructive" : ""}`}>{formatMoney(c.profit)}</TableCell>
                        <TableCell className="text-right font-mono">{marginPct(c.revenue, c.profit).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock valuation (only for roles that can see cost) */}
      {valuation && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Stock valuation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <Tile label="Total stock value" value={formatMoney(valuation.total_value)} tone={Number(valuation.total_value) < 0 ? "danger" : undefined} />
              <Tile label="Products in stock" value={String(valuation.total_lines)} />
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead><TableHead>Product</TableHead><TableHead>Category</TableHead>
                    <TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valuation.items.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No stock on hand.</TableCell></TableRow>)}
                  {valuation.items.map((v, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-muted-foreground">{v.category}</TableCell>
                      <TableCell className={`text-right font-mono ${Number(v.on_hand) < 0 ? "text-destructive" : ""}`}>{Number(v.on_hand).toFixed(2)} {v.uom}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(v.cost)}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(v.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-destructive" : "";
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight font-mono ${color}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tracking-tight font-mono ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
