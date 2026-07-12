"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDeliveryAndInvoiceFromSO } from "../actions";

export function CreateFromSOButtons({
  salesOrderId,
  canCreate,
}: {
  salesOrderId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTx] = useTransition();

  if (!canCreate) return null;

  return (
    <Button
      onClick={() =>
        startTx(async () => {
          const res = await createDeliveryAndInvoiceFromSO(salesOrderId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Delivery note & invoice created — stock updated");
          router.refresh();
        })
      }
      disabled={pending}
    >
      {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
      Create Delivery Note + Invoice
    </Button>
  );
}
