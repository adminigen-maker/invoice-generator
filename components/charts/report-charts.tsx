"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/utils";

const axis = "hsl(var(--muted-foreground))";
const grid = "hsl(var(--border))";

/** A palette that reads on both light and dark cards. */
const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">{children}</div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="h-[240px] grid place-items-center text-sm text-muted-foreground">{label}</div>;
}

/** Revenue per month — colored vertical bars with a gradient. */
export function RevenueBarChart({ data, currency }: { data: Array<{ month: string; revenue: number }>; currency: string }) {
  if (!data.length) return <Empty label="No revenue in this period" />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="gReportRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" stroke={axis} fontSize={11} tickLine={false} axisLine={{ stroke: grid }} />
        <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} width={52}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox>
                <div className="font-medium mb-0.5">{label}</div>
                <div className="font-mono">{formatMoney(Number(payload[0].value), currency)}</div>
              </TooltipBox>
            ) : null
          }
        />
        <Bar dataKey="revenue" fill="url(#gReportRev)" radius={[6, 6, 0, 0]} maxBarSize={46} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** AR aging — donut + legend. */
export function AgingDonut({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const total = data.reduce((s, d) => s + Number(d.value), 0);
  if (total <= 0) return <Empty label="Nothing outstanding — all paid" />;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width="100%" height={220} minWidth={160}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={56} outerRadius={88} paddingAngle={2} stroke="none">
            {data.map((d) => <Cell key={d.label} fill={d.color} />)}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox>
                  <span>{payload[0].payload.label}: </span>
                  <span className="font-mono">{formatMoney(Number(payload[0].value))}</span>
                </TooltipBox>
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-1.5 text-sm w-full sm:w-48">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1 text-muted-foreground">{d.label}</span>
            <span className="font-mono tabular-nums">{formatMoney(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal ranked bars — reused for top products and top customers. */
export function RankBarChart({ data, currency, color = "#6366f1" }: { data: Array<{ name: string; value: number }>; currency: string; color?: string }) {
  if (!data.length) return <Empty label="No sales yet" />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={120}
          tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v)} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox>
                <div className="font-medium">{payload[0].payload.name}</div>
                <div className="font-mono">{formatMoney(Number(payload[0].value), currency)}</div>
              </TooltipBox>
            ) : null
          }
        />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** VAT split by tax rate — pie of taxable amount per rate. */
export function VatPie({ data }: { data: Array<{ code: string; taxable: number; vat: number }> }) {
  const rows = data.filter((d) => Number(d.taxable) > 0);
  const total = rows.reduce((s, d) => s + Number(d.taxable), 0);
  if (total <= 0) return <Empty label="No taxable sales in this period" />;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width="100%" height={220} minWidth={160}>
        <PieChart>
          <Pie data={rows} dataKey="taxable" nameKey="code" innerRadius={0} outerRadius={88} paddingAngle={1} stroke="none">
            {rows.map((d, i) => <Cell key={d.code} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox>
                  <div className="font-medium">{payload[0].payload.code}</div>
                  <div>Taxable <span className="font-mono">{formatMoney(Number(payload[0].payload.taxable))}</span></div>
                  <div>VAT <span className="font-mono">{formatMoney(Number(payload[0].payload.vat))}</span></div>
                </TooltipBox>
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-1.5 text-sm w-full sm:w-48">
        {rows.map((d, i) => (
          <li key={d.code} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 text-muted-foreground font-mono text-xs">{d.code}</span>
            <span className="font-mono tabular-nums">{formatMoney(d.taxable)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
