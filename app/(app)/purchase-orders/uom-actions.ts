"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";

export type QuickUom = { id: string; label: string };

/**
 * Create a unit of measure inline. Units are reference data whose insert RLS is
 * gated on admin.company.edit, so this action matches that permission.
 */
export async function quickCreateUom(input: unknown): Promise<{ ok: true; item: QuickUom } | { ok: false; error: string }> {
  try {
    await requirePermission(P.admin.companyEdit);
    const v = z.object({ code: z.string().min(1, "Code required"), name: z.string().optional().nullable() }).parse(input);
    const supabase = await createClient();
    const code = v.code.trim().toUpperCase();
    const { data, error } = await supabase
      .from("unit_of_measure")
      .insert({ code, name: (v.name || v.code).trim() })
      .select("id, code")
      .single();
    if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? "That unit code already exists." : error.message };
    revalidatePath("/settings/reference");
    return { ok: true, item: { id: data.id, label: data.code } };
  } catch (e) {
    if ((e as { code?: string })?.code === "PERMISSION_DENIED") return { ok: false, error: "Only admins can add units." };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    return { ok: false, error: (e as Error).message };
  }
}
