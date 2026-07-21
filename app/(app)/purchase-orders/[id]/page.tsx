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

  const { data: po } = await supabase
    .from("purchase_order")
    .select("*, vendor:vendor(name), lines:purchase_order_line(description, quantity, uom_text, unit_price, discount_pct, tax_pct, sequence)")
    .eq("id", id)
    .maybeSingle();

  if (!po) return notFound();
  // vendor_name is the standalone field; fall back to a linked vendor for any
  // legacy rows created before the standalone change.
  const vendorName = (po.vendor_name as string | null) ?? (po.vendor as { name?: string } | null)?.name ?? "";
  type PoLine = { sequence: number; description: string; quantity: number; uom_text: string | null; unit_price: number; discount_pct: number; tax_pct: number };
  const lines = ((po.lines ?? []) as PoLine[]).slice().sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {po.number}
            <StatusBadge status={po.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {vendorName || "—"} · Ordered {formatDate(po.order_date)}
            {po.received_at && <> · Received {formatDate(po.received_at)}</>}
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
              vendor_name: vendorName,
              order_date: po.order_date,
              expected_date: po.expected_date,
              currency: po.currency,
              notes: po.notes,
              status: po.status,
              lines,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
