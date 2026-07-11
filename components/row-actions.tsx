"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Power, PowerOff, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ActionResult = { ok: boolean; error?: string };

/**
 * Per-row actions for list tables: Activate / Deactivate (toggles is_active)
 * and Delete (with a confirm dialog). Rendered as visible inline icon buttons.
 * The server actions are passed in from the page; each button only shows if the
 * caller passed the matching permission.
 */
export function RowActions({
  id,
  isActive,
  entityLabel,
  canDeactivate,
  canDelete,
  setActive,
  remove,
}: {
  id: string;
  isActive: boolean;
  entityLabel: string;
  canDeactivate: boolean;
  canDelete: boolean;
  setActive?: (id: string, active: boolean) => Promise<ActionResult>;
  remove?: (id: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const showDeactivate = canDeactivate && !!setActive;
  const showDelete = canDelete && !!remove;
  if (!showDeactivate && !showDelete) return null;

  function doSetActive(active: boolean) {
    startTx(async () => {
      const res = await setActive!(id, active);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(active ? "Activated" : "Deactivated");
        router.refresh();
      }
    });
  }

  function doDelete() {
    startTx(async () => {
      const res = await remove!(id);
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success("Deleted");
        setConfirmDelete(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {showDeactivate &&
        (isActive ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => doSetActive(false)}
            title="Deactivate"
            aria-label="Deactivate"
            className="inline-grid h-8 w-8 place-items-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <PowerOff className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => doSetActive(true)}
            title="Activate"
            aria-label="Activate"
            className="inline-grid h-8 w-8 place-items-center rounded-md border text-emerald-600 hover:bg-accent disabled:opacity-50"
          >
            <Power className="h-4 w-4" />
          </button>
        ))}
      {showDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
          title="Delete"
          aria-label="Delete"
          className={cn(
            "inline-grid h-8 w-8 place-items-center rounded-md border text-muted-foreground",
            "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 disabled:opacity-50"
          )}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => !pending && setConfirmDelete(false)}
        title={`Delete this ${entityLabel}?`}
        description="This permanently removes the record. If it's referenced by other documents, the delete is blocked and you'll get an error."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={doDelete} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
