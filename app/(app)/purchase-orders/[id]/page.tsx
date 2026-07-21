import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PurchaseOrderForm } from "../po-form";
import { PoActions } from "./po-actions";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const perms = await getPermissions();

  const [{ data: po }, { data: vendors }, { data: products }, { data: uoms }, { data: warehouses }, { data: taxes }] = await Promise.all([
    supabase.from("purchase_order")
      .select("*, vendor:vendor(name), lines:purchase_order_line(product_id, description, quantity, uom_id, unit_price, discount_pct, tax_pct, sequence)")
      .eq("id", id).maybeSingle(),
    supabase.from("vendor").select("id, code, name").order("name"),
    supabase.from("product").select("id, sku, name, cost_price, uom_id").order("name"),
    supabase.from("unit_of_measure").select("id, code").order("code"),
    supabase.from("warehouse").select("id, code, name").order("code"),
    supabase.from("tax_rate").select("id, code, rate").order("code"),
  ]);

  if (!po) return notFound();
  type PoLine = { sequence: number; product_id: string | null; description: string; quantity: number; uom_id: string | null; unit_price: number; discount_pct: number; tax_pct: number };
  const lines = ((po.lines ?? []) as PoLine[]).slice().sort((a, b) => a.sequence - b.sequence);
  const vendorName = (po.vendor as { name?: string } | null)?.name ?? (po.vendor_name as string | null) ?? "—";

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {po.number}
            <StatusBadge status={po.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {vendorName} · Ordered {formatDate(po.order_date)}
            {po.received_at && <> · Received {formatDate(po.received_at)}</>}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {po.status === "draft" && "Draft — edit freely, then Confirm to place the order."}
            {po.status === "confirmed" && "Confirmed — still editable. Click Receive when the goods arrive; that adds them to stock."}
            {po.status === "received" && "Received — stock has been added. This order is now locked."}
            {po.status === "cancelled" && "Cancelled."}
          </p>
        </div>
        <PoActions
          id={po.id}
          status={po.status}
          canConfirm={perms.has(P.procurement.poConfirm)}
          canReceive={perms.has(P.procurement.poReceive)}
          canCancel={perms.has(P.procurement.poCancel)}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <PurchaseOrderForm
            initial={{
              id: po.id,
              vendor_id: po.vendor_id ?? "",
              order_date: po.order_date,
              expected_date: po.expected_date,
              warehouse_id: po.warehouse_id,
              currency: po.currency,
              notes: po.notes,
              status: po.status,
              lines,
            }}
            vendors={(vendors ?? []).map((v) => ({ id: v.id, label: `${v.code} — ${v.name}` }))}
            products={(products ?? []).map((p) => ({ id: p.id, label: `${p.sku} — ${p.name}`, extra: { cost_price: p.cost_price, uom_id: p.uom_id } }))}
            uoms={(uoms ?? []).map((u) => ({ id: u.id, label: u.code }))}
            warehouses={(warehouses ?? []).map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` }))}
            taxes={(taxes ?? []).map((t) => ({ id: t.id, label: `${t.code} (${Number(t.rate).toFixed(2)}%)` }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
