"use client";

import {
  Area,
  AreaChart,
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

/** Colors chosen to read on both light and dark cards. */
const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  sent: "#38bdf8",
  confirmed: "#0ea5e9",
  partially_delivered: "#f59e0b",
  delivered: "#0284c7",
  partially_invoiced: "#f59e0b",
  invoiced: "#6366f1",
  partially_paid: "#eab308",
  paid: "#10b981",
  cancelled: "#ef4444",
  closed: "#64748b",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  confirmed: "Confirmed",
  partially_paid: "Partially paid",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
  closed: "Closed",
};

function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {children}
    </div>
  );
}

export function RevenueTrendChart({
  data,
  currency,
}: {
  data: Array<{ month: string; invoiced: number; collected: number }>;
  currency: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="gInvoiced" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" stroke={axis} fontSize={12} tickLine={false} axisLine={{ stroke: grid }} />
        <YAxis
          stroke={axis}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          cursor={{ stroke: grid }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox>
                <div className="font-medium mb-1">{label}</div>
                {payload.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                    <span className="capitalize">{p.name}:</span>
                    <span className="font-mono">{formatMoney(Number(p.value), currency)}</span>
                  </div>
                ))}
              </TooltipBox>
            ) : null
          }
        />
        <Area type="monotone" dataKey="invoiced" stroke="#6366f1" strokeWidth={2} fill="url(#gInvoiced)" />
        <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} fill="url(#gCollected)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusDonutChart({
  data,
}: {
  data: Array<{ status: string; count: number }>;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) {
    return <EmptyChart label="No invoices yet" />;
  }
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ResponsiveContainer width="100%" height={200} minWidth={160}>
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="status" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
            {data.map((d) => (
              <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox>
                  <span className="capitalize">{STATUS_LABELS[payload[0].payload.status] ?? payload[0].payload.status}</span>
                  {": "}
                  <span className="font-mono">{payload[0].value}</span>
                </TooltipBox>
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="space-y-1.5 text-sm w-full sm:w-44">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLORS[d.status] ?? "#94a3b8" }} />
            <span className="flex-1 capitalize text-muted-foreground">{STATUS_LABELS[d.status] ?? d.status}</span>
            <span className="font-medium tabular-nums">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TopCustomersChart({
  data,
  currency,
}: {
  data: Array<{ name: string; total: number }>;
  currency: string;
}) {
  if (!data.length) return <EmptyChart label="No customer sales yet" />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          stroke={axis}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={110}
          tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "…" : v)}
        />
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
        <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[200px] grid place-items-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
