import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PostDeliveryButton } from "./post-button";

export default async function DeliveryNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: dn } = await supabase
    .from("delivery_note")
    .select(`
      *,
      sales_order:sales_order(id, number, customer:customer(name)),
      warehouse:warehouse(name),
      lines:delivery_note_line(product:product(sku,name), uom:unit_of_measure(code), quantity)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!dn) return notFound();

  const canPost = await can(P.inventory.deliveryPost);
  const posted = !!dn.posted_at;
  const so = dn.sales_order as { id?: string; number?: string; customer?: { name?: string } | null } | null;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {dn.number}
            <StatusBadge status={dn.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {so?.customer?.name} · SO&nbsp;
            {so?.id ? <Link href={`/sales-orders/${so.id}`} className="underline">{so.number}</Link> : so?.number}
            {" · "}{formatDate(dn.delivery_date)}
            {(dn.warehouse as { name?: string } | null)?.name && <> · {(dn.warehouse as { name?: string }).name}</>}
          </p>
        </div>
        {!posted && canPost && <PostDeliveryButton id={dn.id} />}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Items shipped</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>UoM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(dn.lines ?? []).map((l: { product?: { sku?: string; name?: string } | null; uom?: { code?: string } | null; quantity: number }, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{l.product?.sku ?? "—"}</TableCell>
                  <TableCell>{l.product?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{Number(l.quantity).toFixed(2)}</TableCell>
                  <TableCell>{l.uom?.code ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
