import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { ilikeTerm } from "@/lib/list-query";

export const dynamic = "force-dynamic";

const INACTIVE = "(cancelled,closed)";

export default async function DeliveryNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { q, view = "active" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("delivery_note")
    .select("id, number, delivery_date, status, posted_at, sales_order:sales_order(number, customer:customer(name))")
    .order("delivery_date", { ascending: false })
    .limit(200);

  if (view === "active") query = query.not("status", "in", INACTIVE);
  else if (view === "inactive") query = query.in("status", ["cancelled", "closed"]);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term}`);

  const { data: rows } = await query;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Delivery Notes</h1>
        <p className="text-sm text-muted-foreground">
          Goods issue documents. Posting a delivery note deducts stock.
        </p>
      </div>

      <ListToolbar searchPlaceholder="Search delivery number…" />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Sales Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Posted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {q ? `No delivery notes match “${q}”.` : "No delivery notes here."}
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => {
              const so = r.sales_order as { number?: string; customer?: { name?: string } | null } | null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/delivery-notes/${r.id}`} className="hover:underline">{r.number}</Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{so?.number ?? "—"}</TableCell>
                  <TableCell>{so?.customer?.name ?? "—"}</TableCell>
                  <TableCell>{formatDate(r.delivery_date)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>{r.posted_at ? formatDate(r.posted_at) : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
