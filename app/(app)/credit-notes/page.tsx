import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/list-toolbar";
import { SortHeader } from "@/components/sort-header";
import { resolveSort } from "@/lib/list-sort";
import { ilikeTerm } from "@/lib/list-query";

export const dynamic = "force-dynamic";

const SORTABLE = ["number", "credit_date", "total", "created_at"] as const;

type Row = {
  id: string;
  number: string;
  credit_date: string;
  total: number;
  currency: string;
  reason: string | null;
  created_at: string;
  customer: { name?: string } | null;
  invoice: { id?: string; number?: string } | null;
};

export default async function CreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string }>;
}) {
  if (!(await can(P.invoice.creditNoteView))) redirect("/");
  const { q, sort, dir } = await searchParams;
  const supabase = await createClient();
  const order = resolveSort(sort, dir, SORTABLE);

  let query = supabase
    .from("credit_note")
    .select("id, number, credit_date, total, currency, reason, created_at, customer:customer(name), invoice:invoice(id, number)")
    .neq("status", "cancelled")
    .order(order.column, { ascending: order.ascending })
    .limit(200);

  const term = ilikeTerm(q);
  if (term) query = query.or(`number.ilike.${term},reason.ilike.${term}`);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const totalCredited = rows.reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Returns / Credit notes</h1>
        <p className="text-sm text-muted-foreground">
          Goods returned by customers. Each credit reduces its invoice&apos;s balance and puts the stock back.
        </p>
      </div>

      <ListToolbar showViews={false} searchPlaceholder="Search credit note or reason…" />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader column="number">Number</SortHeader>
              <TableHead>Customer</TableHead>
              <TableHead>Against invoice</TableHead>
              <SortHeader column="credit_date">Date</SortHeader>
              <TableHead>Reason</TableHead>
              <SortHeader column="total" className="text-right">Credit</SortHeader>
              <SortHeader column="created_at">Created</SortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {q ? `No credit notes match “${q}”.` : "No returns recorded yet."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.number}</TableCell>
                <TableCell className="font-medium">{r.customer?.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.invoice?.id ? (
                    <Link href={`/invoices/${r.invoice.id}`} className="text-blue-600 hover:text-blue-700">{r.invoice.number}</Link>
                  ) : "—"}
                </TableCell>
                <TableCell>{formatDate(r.credit_date)}</TableCell>
                <TableCell className="text-muted-foreground">{r.reason ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">− {formatMoney(r.total, r.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {rows.length > 0 && (
        <div className="flex justify-end text-sm">
          <div className="rounded-lg border px-4 py-2">
            <span className="text-muted-foreground mr-3">Total credited</span>
            <span className="font-mono font-semibold">− {formatMoney(totalCredited)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
