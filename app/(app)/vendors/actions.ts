"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";

const vendorSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1, "Name required"),
  legal_name: z.string().optional().nullable(),
  tax_registration_number: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  payment_terms_days: z.coerce.number().int().min(0).default(30),
  default_tax_id: z.string().uuid().optional().nullable(),
  currency: z.string().default("AED"),
  notes: z.string().optional().nullable(),
  is_active: z.coerce.boolean().default(true),
});

type FormResult = { ok: true; id: string } | { ok: false; error: string };

function parseForm(fd: FormData) {
  const raw = Object.fromEntries(fd.entries());
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    clean[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  clean.is_active = fd.get("is_active") === "on";
  if (!clean.currency) clean.currency = "AED";
  return vendorSchema.parse(clean);
}

async function nextCode() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("next_document_number", { seq_code: "vendor" });
  return (data as string) ?? `VEND-${Date.now()}`;
}

export async function createVendor(fd: FormData): Promise<FormResult> {
  try {
    await requirePermission(P.procurement.vendorCreate);
    const supabase = await createClient();
    const input = parseForm(fd);
    if (!input.code) input.code = await nextCode();
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("vendor")
      .insert({ ...input, created_by: user.user?.id })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/vendors");
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: actionError(e, "create vendors") };
  }
}

export async function updateVendor(id: string, fd: FormData): Promise<FormResult> {
  try {
    await requirePermission(P.procurement.vendorEdit);
    const input = parseForm(fd);
    const supabase = await createClient();
    const patch = { ...input };
    if (!patch.code) delete patch.code;
    const { error } = await supabase.from("vendor").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: actionError(e, "edit vendors") };
  }
}

export async function setVendorActive(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(P.procurement.vendorEdit);
    const supabase = await createClient();
    const { error } = await supabase.from("vendor").update({ is_active: active }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/vendors");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: actionError(e, "edit vendors") };
  }
}

export async function deleteVendor(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(P.procurement.vendorDelete);
    const supabase = await createClient();
    const { error } = await supabase.from("vendor").delete().eq("id", id);
    if (error) {
      return {
        ok: false,
        error: /foreign key|violates|referenced|23503/i.test(error.message)
          ? "Can't delete: this vendor is used by other documents. Deactivate it instead."
          : error.message,
      };
    }
    revalidatePath("/vendors");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: actionError(e, "delete vendors") };
  }
}

function actionError(e: unknown, action: string): string {
  if ((e as { code?: string })?.code === "PERMISSION_DENIED") {
    return `You don't have permission to ${action}.`;
  }
  if (e instanceof z.ZodError) return e.issues[0].message;
  return (e as Error)?.message ?? "Something went wrong";
}
