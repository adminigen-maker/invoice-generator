"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { overrideStatus } from "@/lib/status/override-status";

const STATUSES = [
  "draft", "sent", "confirmed",
  "partially_delivered", "delivered",
  "partially_invoiced", "invoiced",
  "partially_paid", "paid",
  "overdue", "cancelled", "closed",
];

/**
 * Admin-only manual status changer. Shown next to a document's status badge
 * when the current user holds `admin.status.override`. It is a label change
 * only — the note makes clear it does not move stock or money.
 */
export function StatusOverride({ entity, id, current }: { entity: string; id: string; current: string }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [value, setValue] = useState(current);

  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5" />Admin: override status
      </div>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm capitalize"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || value === current}
          onClick={() =>
            startTx(async () => {
              const r = await overrideStatus(entity, id, value);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("Status updated");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Manual override — does not move stock or record/undo payments.</p>
    </div>
  );
}
