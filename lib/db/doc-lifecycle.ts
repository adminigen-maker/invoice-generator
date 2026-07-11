import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { CANCELLABLE_STATUS, DELETABLE_STATUS, type DocType } from "@/lib/doc-status";

export type LifecycleResult = { ok: boolean; error?: string };

const LABEL: Record<DocType, string> = {
  quotation: "quotation",
  sales_order: "sales order",
  delivery_note: "delivery note",
  invoice: "invoice",
  payment: "payment",
};

function permError(e: unknown, verb: string, label: string): string {
  if ((e as { code?: string })?.code === "PERMISSION_DENIED") {
    return `You don't have permission to ${verb} ${label}s.`;
  }
  return (e as Error)?.message ?? "Something went wrong";
}

function friendlyDeleteError(message: string): string {
  if (/posted|issued/i.test(message)) {
    return "This document has been posted/issued and can't be deleted. Cancel or reverse it instead.";
  }
  if (/foreign key|violates|referenced|23503/i.test(message)) {
    return "Can't delete: this document is linked to newer ones (e.g. a sales order, delivery note, invoice or payment). Remove those first.";
  }
  return message;
}

/**
 * Cancel a document (status → 'cancelled'). The `.in(status, ...)` filter means
 * the update only matches when the row is in a cancellable state, so a
 * posted/paid document can never be cancelled even if this is called directly.
 */
export async function cancelDocument(
  type: DocType,
  perm: string,
  listPath: string,
  id: string
): Promise<LifecycleResult> {
  const label = LABEL[type];
  try {
    await requirePermission(perm);
    const allowed = CANCELLABLE_STATUS[type] ?? [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(type)
      .update({ status: "cancelled" })
      .eq("id", id)
      .in("status", allowed)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return { ok: false, error: `This ${label} can't be cancelled in its current state.` };
    }
    revalidatePath(listPath);
    revalidatePath(`${listPath}/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permError(e, "cancel", label) };
  }
}

/**
 * Hard-delete a document. Enforces the safe-state gate, then relies on
 * cross-document foreign keys to block anything with downstream records.
 */
export async function deleteDocument(
  type: DocType,
  perm: string,
  listPath: string,
  id: string
): Promise<LifecycleResult> {
  const label = LABEL[type];
  try {
    await requirePermission(perm);
    const supabase = await createClient();

    const allowed = DELETABLE_STATUS[type];
    if (allowed) {
      const { data: row, error: readErr } = await supabase
        .from(type)
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      // Fail CLOSED: if we can't read the row (not found, or hidden by RLS
      // because the caller lacks the view permission) we must not delete — the
      // status gate below is the only app-side guard for stock/financial safety.
      if (!row) {
        return { ok: false, error: `Can't delete this ${label}: it's missing or you don't have permission to view it.` };
      }
      if (!allowed.includes((row as { status: string }).status)) {
        return { ok: false, error: `This ${label} can't be deleted in its current state. Cancel it instead.` };
      }
    }

    // .select() so an RLS-scope-filtered no-op (0 rows, no error) is reported as
    // a failure instead of a false "Deleted".
    const { data: deleted, error } = await supabase.from(type).delete().eq("id", id).select("id");
    if (error) return { ok: false, error: friendlyDeleteError(error.message) };
    if (!deleted || deleted.length === 0) {
      return { ok: false, error: `This ${label} wasn't deleted — it may be outside your access scope.` };
    }
    revalidatePath(listPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permError(e, "delete", label) };
  }
}
