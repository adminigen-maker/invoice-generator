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

const companySchema = z.object({
  name: z.string().trim().min(1, "Company name required"),
  legal_name: z.string().trim().optional().nullable(),
  tax_registration_number: z.string().trim().optional().nullable(),
  currency: z.string().trim().min(1).max(8),
  address_line1: z.string().trim().optional().nullable(),
  address_line2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email("Invalid email").or(z.literal("")).nullable().optional(),
  website: z.string().trim().optional().nullable(),
  bank_account: z.string().trim().optional().nullable(),
  logo_url: z.string().trim().url("Logo must be a URL").or(z.literal("")).nullable().optional(),
});

export async function updateCompany(input: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(P.admin.companyEdit);
    const v = companySchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase
      .from("company")
      .update({
        ...v,
        email: v.email || null,
        logo_url: v.logo_url || null,
      })
      .eq("singleton", true);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    revalidatePath("/"); // company details appear on the dashboard/PDF header
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string })?.code === "PERMISSION_DENIED") {
      return { ok: false, error: "You don't have permission to edit the company profile." };
    }
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    return { ok: false, error: (e as Error)?.message ?? "Something went wrong" };
  }
}
