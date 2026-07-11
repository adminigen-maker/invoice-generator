"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";

const seqSchema = z.object({
  id: z.string().uuid(),
  prefix: z.string().trim().min(1, "Prefix required").max(12),
  format: z.string().trim().min(1, "Format required").max(40),
  padding: z.coerce.number().int().min(1, "Padding must be ≥ 1").max(12),
  next_number: z.coerce.number().int().min(1, "Next number must be ≥ 1"),
  reset_yearly: z.coerce.boolean(),
});

export async function updateSequence(input: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(P.admin.sequenceEdit);
    const v = seqSchema.parse(input);
    if (!v.format.includes("{SEQ}")) {
      return { ok: false, error: "Format must contain {SEQ} (the running number)." };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("document_sequence")
      .update({
        prefix: v.prefix,
        format: v.format,
        padding: v.padding,
        next_number: v.next_number,
        reset_yearly: v.reset_yearly,
      })
      .eq("id", v.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string })?.code === "PERMISSION_DENIED") {
      return { ok: false, error: "You don't have permission to edit document numbering." };
    }
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    return { ok: false, error: (e as Error)?.message ?? "Something went wrong" };
  }
}
