import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  const supabase = await createClient();
  const perms = await getPermissions();

  const { data: rows } = await supabase
    .from("quotation")
    .select("id, number, quote_date, valid_until, status, total, currency, customer:customer(name)")
    .order("quote_date", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotations</h1>
          <p className="text-sm text-muted-foreground">Sales offers waiting to be confirmed</p>
        </div>
        {perms.has(P.sales.quotationCreate) && (
          <Button asChild>
            <Link href="/quotations/new"><Plus className="h-4 w-4 mr-2" />New quotation</Link>
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Valid until</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No quotations yet.
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/quotations/${q.id}`} className="hover:underline">{q.number}</Link>
                </TableCell>
                <TableCell className="font-medium">
                  {(q.customer as { name?: string } | null)?.name ?? "—"}
                </TableCell>
                <TableCell>{formatDate(q.quote_date)}</TableCell>
                <TableCell>{formatDate(q.valid_until)}</TableCell>
                <TableCell><StatusBadge status={q.status} /></TableCell>
                <TableCell className="text-right font-mono">{formatMoney(q.total, q.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
