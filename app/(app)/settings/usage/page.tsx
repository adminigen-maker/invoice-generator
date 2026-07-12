import { redirect } from "next/navigation";
import { Database, HardDrive, Users, Gauge, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Supabase Free-tier limits (see supabase.com/pricing).
const FREE = {
  dbBytes: 500 * 1024 * 1024, // 500 MB
  storageBytes: 1 * 1024 * 1024 * 1024, // 1 GB
  authUsers: 50_000, // Monthly Active Users
  egress: "5 GB / month",
  edgeInvocations: "500K / month",
  projects: "2 active",
  backups: "None (paid plans only)",
  pause: "Pauses after ~7 days of inactivity",
};

type Stats = {
  db_bytes: number;
  storage_bytes: number;
  storage_objects: number;
  auth_users: number;
  tables: { name: string; bytes: number; est_rows: number }[];
};

function fmtBytes(n: number): string {
  if (!n || n < 1024) return `${n ?? 0} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export default async function UsagePage() {
  if (!(await can(P.admin.companyEdit))) redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_usage_stats");
  const s = (data as Stats | null) ?? null;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage &amp; Limits</h1>
          <p className="text-sm text-muted-foreground">
            Live figures from your Supabase project, measured against the Free‑tier limits.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs">Plan: Free</Badge>
          <Button asChild variant="outline" size="sm">
            <a href="/settings/usage"><RefreshCw className="h-4 w-4 mr-1" />Refresh</a>
          </Button>
        </div>
      </div>

      {!s && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Couldn&apos;t load usage stats{error?.message ? `: ${error.message}` : ""}.
          </CardContent>
        </Card>
      )}

      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MeterCard
              icon={<Database className="h-4 w-4 text-sky-500" />}
              title="Database size"
              used={s.db_bytes}
              usedLabel={fmtBytes(s.db_bytes)}
              limit={FREE.dbBytes}
              limitLabel={fmtBytes(FREE.dbBytes)}
            />
            <MeterCard
              icon={<HardDrive className="h-4 w-4 text-violet-500" />}
              title="File storage"
              used={s.storage_bytes}
              usedLabel={fmtBytes(s.storage_bytes)}
              limit={FREE.storageBytes}
              limitLabel={fmtBytes(FREE.storageBytes)}
              note={`${s.storage_objects} file${s.storage_objects === 1 ? "" : "s"}`}
            />
            <MeterCard
              icon={<Users className="h-4 w-4 text-emerald-500" />}
              title="Auth users"
              used={s.auth_users}
              usedLabel={s.auth_users.toLocaleString()}
              limit={FREE.authUsers}
              limitLabel={FREE.authUsers.toLocaleString()}
              note="Free tier allows 50,000 monthly active users"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Largest tables</CardTitle>
                <CardDescription>Top consumers of your 500 MB database.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.tables.map((t) => (
                      <TableRow key={t.name}>
                        <TableCell className="font-mono text-xs">{t.name}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {Math.max(0, t.est_rows).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtBytes(t.bytes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-teal-500" />
                  Free‑tier limits
                </CardTitle>
                <CardDescription>What the current plan includes.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="text-sm divide-y">
                  <LimitRow k="Database" v={`${fmtBytes(FREE.dbBytes)}`} />
                  <LimitRow k="File storage" v={fmtBytes(FREE.storageBytes)} />
                  <LimitRow k="Monthly active users" v={FREE.authUsers.toLocaleString()} />
                  <LimitRow k="Egress / bandwidth" v={FREE.egress} hint="Track in the Supabase dashboard" />
                  <LimitRow k="Edge function calls" v={FREE.edgeInvocations} />
                  <LimitRow k="Active projects" v={FREE.projects} />
                  <LimitRow k="Daily backups" v={FREE.backups} />
                  <LimitRow k="Inactivity" v={FREE.pause} hint="A daily keep‑alive cron already prevents this" />
                </dl>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function MeterCard({
  icon,
  title,
  used,
  usedLabel,
  limit,
  limitLabel,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  used: number;
  usedLabel: string;
  limit: number;
  limitLabel: string;
  note?: string;
}) {
  const pct = Math.min(100, limit > 0 ? (used / limit) * 100 : 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tracking-tight">{usedLabel}</span>
          <span className="text-xs text-muted-foreground">of {limitLabel}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{pct < 0.1 ? "<0.1" : pct.toFixed(pct < 10 ? 1 : 0)}% used</span>
          {note && <span>{note}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function LimitRow({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">
        <div className="font-medium">{v}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </dd>
    </div>
  );
}
