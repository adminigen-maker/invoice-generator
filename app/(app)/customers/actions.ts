"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";

const customerSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1, "Name required"),
  legal_name: z.string().optional().nullable(),
  tax_registration_number: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  credit_limit: z.coerce.number().min(0).default(0),
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
  return customerSchema.parse(clean);
}

async function nextCode() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("next_document_number", { seq_code: "customer" });
  return (data as string) ?? `CUST-${Date.now()}`;
}

export async function createCustomer(_prev: FormResult | undefined, fd: FormData): Promise<FormResult> {
  try {
    await requirePermission(P.sales.customerCreate);
    if (!fd.get("code") || fd.get("code") === "") fd.set("code", await nextCode());
    const input = parseForm(fd);
    const supabase = await createClient();
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("customer")
      .insert({ ...input, created_by: user.user?.id })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/customers");
    redirect(`/customers/${data.id}`);
  } catch (e) {
    if ((e as { code?: string }).code === "PERMISSION_DENIED") {
      return { ok: false, error: "You don't have permission to create customers." };
    }
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    throw e;
  }
}

export async function updateCustomer(id: string, _prev: FormResult | undefined, fd: FormData): Promise<FormResult> {
  try {
    await requirePermission(P.sales.customerEdit);
    const input = parseForm(fd);
    const supabase = await createClient();
    const { error } = await supabase.from("customer").update(input).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { ok: true, id };
  } catch (e) {
    if ((e as { code?: string }).code === "PERMISSION_DENIED") {
      return { ok: false, error: "You don't have permission to edit customers." };
    }
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    throw e;
  }
}
