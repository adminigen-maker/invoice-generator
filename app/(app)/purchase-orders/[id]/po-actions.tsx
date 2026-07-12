"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, PackageCheck, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder } from "../actions";

export function PoActions({
  id, status, canConfirm, canReceive, canCancel,
}: { id: string; status: string; canConfirm: boolean; canReceive: boolean; canCancel: boolean }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();

  function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTx(async () => {
      const res = await fn(id);
      if (!res.ok) toast.error(res.error);
      else { toast.success(ok); router.refresh(); }
    });
  }

  const isDraft = status === "draft";
  const isConfirmed = status === "confirmed";
  const cancellable = isDraft || isConfirmed;

  return (
    <div className="flex flex-wrap gap-2">
      {isDraft && canConfirm && (
        <Button onClick={() => run(confirmPurchaseOrder, "Confirmed")} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Confirm
        </Button>
      )}
      {isConfirmed && canReceive && (
        <Button onClick={() => run(receivePurchaseOrder, "Received into stock")} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}Receive
        </Button>
      )}
      {cancellable && canCancel && (
        <Button variant="destructive" onClick={() => run(cancelPurchaseOrder, "Cancelled")} disabled={pending}>
          <Ban className="h-4 w-4 mr-2" />Cancel
        </Button>
      )}
    </div>
  );
}
