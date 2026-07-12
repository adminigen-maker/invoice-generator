import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const TABLES = ["invoice", "payment", "purchase_order", "sales_order", "quotation", "delivery_note", "customer", "vendor", "product"];

type AuditRow = {
  id: string;
  created_at: string;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete";
  changes: Record<string, unknown> | null;
  actor: { display_name?: string; email?: string } | null;
};

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  if (!(await can(P.admin.auditView))) redirect("/");
  const { table } = await searchParams;

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, created_at, table_name, record_id, action, changes, actor:app_user(display_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (table && TABLES.includes(table)) query = query.eq("table_name", table);

  const { data } = await query;
  const rows = (data ?? []) as unknown as AuditRow[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">Who changed what, and when — across financial and master records.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip label="All" href="/settings/audit" active={!table} />
        {TABLES.map((t) => (
          <FilterChip key={t} label={t.replace("_", " ")} href={`/settings/audit?table=${t}`} active={table === t} />
        ))}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">When</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Record</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Changes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No activity recorded yet.</TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                <TableCell className="text-sm">
                  {r.actor?.display_name ?? <span className="text-muted-foreground">System</span>}
                  {r.actor?.email && <div className="text-xs text-muted-foreground font-mono">{r.actor.email}</div>}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="capitalize">{r.table_name.replace("_", " ")}</span>
                  <div className="font-mono text-muted-foreground">{r.record_id?.slice(0, 8)}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={r.action === "delete" ? "destructive" : r.action === "insert" ? "success" : "info"}>
                    {r.action === "insert" ? "Created" : r.action === "update" ? "Updated" : "Deleted"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs">
                  {r.action === "update" && r.changes
                    ? Object.keys(r.changes).join(", ")
                    : r.action === "insert"
                    ? "New record"
                    : "Record removed"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-accent"
      }`}
    >
      {label}
    </a>
  );
}
