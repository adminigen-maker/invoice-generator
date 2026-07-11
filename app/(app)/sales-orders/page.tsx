import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { ilikeTerm } from "@/lib/list-query";

export const dynamic = "force-dynamic";

const INACTIVE = "(cancelled,closed)";

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { q, view = "active" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("sales_order")
    .select("id, number, order_date, status, total, currency, customer:customer(name)")
    .order("order_date", { ascending: false })
    .limit(200);

  if (view === "active") query = query.not("status", "in", INACTIVE);
  else if (view === "inactive") query = query.in("status", ["cancelled", "closed"]);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term}`);

  const { data: rows } = await query;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales Orders</h1>
        <p className="text-sm text-muted-foreground">Confirmed customer commitments awaiting delivery & invoicing</p>
      </div>

      <ListToolbar searchPlaceholder="Search order number…" />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {q ? `No sales orders match “${q}”.` : "No sales orders here. Confirm a quotation to create one."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/sales-orders/${r.id}`} className="hover:underline">{r.number}</Link>
                </TableCell>
                <TableCell className="font-medium">{(r.customer as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>{formatDate(r.order_date)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.total, r.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
