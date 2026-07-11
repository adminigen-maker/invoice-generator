"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ActionResult = { ok: boolean; error?: string };

/**
 * Row actions for transactional documents: Cancel (status → cancelled) and
 * Delete. Both confirm first. Whether each is shown is decided by the page
 * (permission + safe lifecycle state), so this component just renders.
 */
export function DocRowActions({
  id,
  entityLabel,
  showCancel,
  showDelete,
  cancel,
  remove,
}: {
  id: string;
  entityLabel: string;
  showCancel: boolean;
  showDelete: boolean;
  cancel?: (id: string) => Promise<ActionResult>;
  remove?: (id: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [confirm, setConfirm] = useState<null | "cancel" | "delete">(null);

  if (!showCancel && !showDelete) return <span className="text-muted-foreground">—</span>;

  function run(kind: "cancel" | "delete") {
    const fn = kind === "cancel" ? cancel : remove;
    if (!fn) return;
    startTx(async () => {
      const res = await fn(id);
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success(kind === "cancel" ? "Cancelled" : "Deleted");
        setConfirm(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {showCancel && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirm("cancel")}
          title="Cancel"
          aria-label="Cancel"
          className="inline-grid h-8 w-8 place-items-center rounded-md border text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/40 disabled:opacity-50"
        >
          <Ban className="h-4 w-4" />
        </button>
      )}
      {showDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirm("delete")}
          title="Delete"
          aria-label="Delete"
          className="inline-grid h-8 w-8 place-items-center rounded-md border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <Dialog
        open={confirm === "cancel"}
        onClose={() => !pending && setConfirm(null)}
        title={`Cancel this ${entityLabel}?`}
        description="Its status becomes “Cancelled”. This is reversible only by editing the document."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)} disabled={pending}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => run("cancel")} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel {entityLabel}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirm === "delete"}
        onClose={() => !pending && setConfirm(null)}
        title={`Delete this ${entityLabel}?`}
        description="This permanently removes the record. If it's linked to other documents, the delete is blocked and you'll get an error."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)} disabled={pending}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => run("delete")} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
