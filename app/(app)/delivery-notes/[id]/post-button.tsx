"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postDeliveryNote } from "../actions";

export function PostDeliveryButton({ id }: { id: string }) {
  const [pending, startTx] = useTransition();
  return (
    <Button
      onClick={() =>
        startTx(async () => {
          const res = await postDeliveryNote(id);
          if (!res.ok) toast.error(res.error ?? "Failed");
          else toast.success("Delivered — stock moves posted");
        })
      }
      disabled={pending}
    >
      <CheckCircle2 className="h-4 w-4 mr-2" />
      {pending ? "Posting…" : "Post & deduct stock"}
    </Button>
  );
}
