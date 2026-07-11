"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Truck, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDeliveryNoteFromSO, createInvoiceFromSO } from "../actions";

export function CreateFromSOButtons({
  salesOrderId, canDeliver, canInvoice,
}: { salesOrderId: string; canDeliver: boolean; canInvoice: boolean }) {
  const [pending, startTx] = useTransition();

  return (
    <div className="flex gap-2">
      {canDeliver && (
        <Button variant="outline" onClick={() => startTx(async () => {
          const res = await createDeliveryNoteFromSO(salesOrderId);
          if (res && !res.ok) toast.error(res.error);
        })} disabled={pending}>
          <Truck className="h-4 w-4 mr-2" />
          Create Delivery Note
        </Button>
      )}
      {canInvoice && (
        <Button onClick={() => startTx(async () => {
          const res = await createInvoiceFromSO(salesOrderId);
          if (res && !res.ok) toast.error(res.error);
        })} disabled={pending}>
          <Receipt className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      )}
    </div>
  );
}
