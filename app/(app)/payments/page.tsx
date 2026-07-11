import { createClient } from "@/lib/db/supabase-server";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("payment")
    .select("id, number, payment_date, method, reference, amount, amount_unallocated, currency, customer:customer(name)")
    .order("payment_date", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Receipts from customers, allocated across invoices</p>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Unallocated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No payments yet.
                </TableCell>
              </TableRow>
            )}
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.number}</TableCell>
                <TableCell className="font-medium">{(r.customer as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>{formatDate(r.payment_date)}</TableCell>
                <TableCell className="capitalize">{r.method?.replace("_", " ")}</TableCell>
                <TableCell className="text-muted-foreground">{r.reference ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(r.amount, r.currency)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{formatMoney(r.amount_unallocated, r.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
