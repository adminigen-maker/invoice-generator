import { redirect } from "next/navigation";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { PurchaseOrderForm } from "../po-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  if (!(await can(P.procurement.poCreate))) redirect("/purchase-orders");

  return (
    <div className="space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">New purchase order</h1>
      <Card>
        <CardContent className="pt-6">
          <PurchaseOrderForm />
        </CardContent>
      </Card>
    </div>
  );
}
