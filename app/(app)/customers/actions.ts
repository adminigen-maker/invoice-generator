"use server";

import { revalidatePath } from "next/cache";
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

export async function createCustomer(fd: FormData): Promise<FormResult> {
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
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: actionError(e, "create customers") };
  }
}

export async function updateCustomer(id: string, fd: FormData): Promise<FormResult> {
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
    return { ok: false, error: actionError(e, "edit customers") };
  }
}

// Minimal inline creation used by the "+ New customer" quick-add in forms.
const quickCustomerSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  payment_terms_days: z.coerce.number().int().min(0).default(30),
  default_tax_id: z.string().uuid().optional().nullable().or(z.literal("")),
});

export type QuickCustomer = { id: string; label: string; extra: { default_tax_id: string | null } };

export async function quickCreateCustomer(
  input: unknown
): Promise<{ ok: true; item: QuickCustomer } | { ok: false; error: string }> {
  try {
    await requirePermission(P.sales.customerCreate);
    const v = quickCustomerSchema.parse(input);
    const supabase = await createClient();
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("customer")
      .insert({
        code: await nextCode(),
        name: v.name,
        email: v.email || null,
        phone: v.phone || null,
        payment_terms_days: v.payment_terms_days,
        default_tax_id: v.default_tax_id || null,
        created_by: user.user?.id,
      })
      .select("id, code, name, default_tax_id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/customers");
    return {
      ok: true,
      item: { id: data.id, label: `${data.code} — ${data.name}`, extra: { default_tax_id: data.default_tax_id } },
    };
  } catch (e) {
    return { ok: false, error: actionError(e, "create customers") };
  }
}

export async function setCustomerActive(
  id: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(P.sales.customerEdit);
    const supabase = await createClient();
    const { error } = await supabase.from("customer").update({ is_active: active }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/customers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: actionError(e, "edit customers") };
  }
}

export async function deleteCustomer(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(P.sales.customerDelete);
    const supabase = await createClient();
    const { error } = await supabase.from("customer").delete().eq("id", id);
    if (error) return { ok: false, error: friendlyDeleteError(error.message) };
    revalidatePath("/customers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: actionError(e, "delete customers") };
  }
}

function friendlyDeleteError(message: string): string {
  if (/foreign key|violates|referenced|23503/i.test(message)) {
    return "Can't delete: this customer is used by other documents. Deactivate it instead.";
  }
  return message;
}

function actionError(e: unknown, action: string): string {
  if ((e as { code?: string })?.code === "PERMISSION_DENIED") {
    return `You don't have permission to ${action}.`;
  }
  if (e instanceof z.ZodError) return e.issues[0].message;
  return (e as Error)?.message ?? "Something went wrong";
}
