import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocMetaGrid, DocStatGrid } from "@/components/doc-detail";
import { PdfButton } from "@/components/pdf-button";
import { PostDeliveryButton } from "./post-button";

type Line = { product?: { sku?: string; name?: string } | null; uom?: { code?: string } | null; quantity: number };

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
  const lines = (dn.lines ?? []) as Line[];
  const totalQty = lines.reduce((s, l) => s + Number(l.quantity), 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {dn.number}
            <StatusBadge status={dn.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Goods issue{posted ? ` · posted ${formatDate(dn.posted_at)}` : " · not yet posted"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PdfButton url={`/delivery-notes/${dn.id}/pdf`} filename={`${dn.number}.pdf`} />
          {!posted && canPost && <PostDeliveryButton id={dn.id} />}
        </div>
      </div>

      <DocMetaGrid
        items={[
          { label: "Customer", value: so?.customer?.name ?? "—" },
          {
            label: "Sales order",
            value: so?.id ? <Link href={`/sales-orders/${so.id}`} className="underline">{so.number}</Link> : (so?.number ?? "—"),
          },
          { label: "Delivery date", value: formatDate(dn.delivery_date) },
          { label: "Warehouse", value: (dn.warehouse as { name?: string } | null)?.name ?? "—" },
        ]}
      />

      <DocStatGrid
        items={[
          { label: "Line items", value: String(lines.length) },
          { label: "Total quantity", value: totalQty.toFixed(2) },
          { label: "Stock posted", value: posted ? "Yes" : "No", tone: posted ? "success" : undefined },
        ]}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Items shipped</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>UoM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-mono text-xs">{l.product?.sku ?? "—"}</TableCell>
                  <TableCell className="font-medium">{l.product?.name ?? "—"}</TableCell>
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
