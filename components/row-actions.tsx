"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Power, PowerOff, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ActionResult = { ok: boolean; error?: string };

/**
 * Per-row menu for list tables: Activate / Deactivate (toggles is_active) and
 * Delete (with a confirm dialog). The server actions are passed in from the
 * page, and each item only shows if the caller passed the matching permission.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const showDeactivate = canDeactivate && !!setActive;
  const showDelete = canDelete && !!remove;
  if (!showDeactivate && !showDelete) return null;

  function doSetActive(active: boolean) {
    setMenuOpen(false);
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
    <div className="relative flex justify-end">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMenuOpen((o) => !o)} aria-label="Row actions">
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-40 rounded-md border bg-popover text-popover-foreground shadow-lg py-1 text-sm">
            {showDeactivate &&
              (isActive ? (
                <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent" onClick={() => doSetActive(false)}>
                  <PowerOff className="h-4 w-4" /> Deactivate
                </button>
              ) : (
                <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent" onClick={() => doSetActive(true)}>
                  <Power className="h-4 w-4" /> Activate
                </button>
              ))}
            {showDelete && (
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-destructive"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </>
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
