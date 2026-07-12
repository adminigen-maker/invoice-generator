"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";

const productSchema = z.object({
  // Optional — a blank SKU is auto-generated on create (e.g. SKU-00001).
  sku: z.string().optional().nullable(),
  name: z.string().min(1, "Name required"),
  description: z.string().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  uom_id: z.string().uuid("Unit of measure required"),
  cost_price: z.coerce.number().min(0).default(0),
  sale_price: z.coerce.number().min(0).default(0),
  tax_id: z.string().uuid().optional().nullable(),
  reorder_point: z.coerce.number().min(0).optional().nullable(),
  is_stockable: z.coerce.boolean().default(true),
  is_active: z.coerce.boolean().default(true),
});

type FormResult = { ok: true; id: string } | { ok: false; error: string };

/** Draw the next SKU from the `product` numbering sequence (e.g. SKU-00001). */
async function nextSku(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data } = await supabase.rpc("next_document_number", { seq_code: "product" });
  return (data as string) ?? `SKU-${Date.now()}`;
}

function parseForm(fd: FormData) {
  const raw = Object.fromEntries(fd.entries());
  // FormData does not distinguish empty string from missing. Normalize.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    clean[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  clean.is_stockable = fd.get("is_stockable") === "on";
  clean.is_active = fd.get("is_active") === "on";
  return productSchema.parse(clean);
}

export async function createProduct(fd: FormData): Promise<FormResult> {
  try {
    await requirePermission(P.inventory.productCreate);
    const input = parseForm(fd);
    const supabase = await createClient();
    if (!input.sku) input.sku = await nextSku(supabase);
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("product")
      .insert({ ...input, created_by: user.user?.id })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/products");
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: actionError(e, "create products") };
  }
}

export async function updateProduct(id: string, fd: FormData): Promise<FormResult> {
  try {
    await requirePermission(P.inventory.productEdit);
    const input = parseForm(fd);
    const supabase = await createClient();
    // Never blank out an existing SKU on edit.
    const patch = { ...input };
    if (!patch.sku) delete patch.sku;
    const { error } = await supabase.from("product").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: actionError(e, "edit products") };
  }
}

// Minimal inline creation used by the "+ New product" quick-add in forms.
const quickProductSchema = z.object({
  sku: z.string().optional().nullable().or(z.literal("")),
  name: z.string().min(1, "Name required"),
  uom_id: z.string().uuid("Unit of measure required"),
  sale_price: z.coerce.number().min(0).default(0),
  tax_id: z.string().uuid().optional().nullable().or(z.literal("")),
});

export type QuickProduct = {
  id: string;
  label: string;
  extra: { sale_price: number; uom_id: string | null; tax_id: string | null };
};

export async function quickCreateProduct(
  input: unknown
): Promise<{ ok: true; item: QuickProduct } | { ok: false; error: string }> {
  try {
    await requirePermission(P.inventory.productCreate);
    const v = quickProductSchema.parse(input);
    const supabase = await createClient();
    const sku = v.sku || (await nextSku(supabase));
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("product")
      .insert({
        sku,
        name: v.name,
        uom_id: v.uom_id,
        sale_price: v.sale_price,
        tax_id: v.tax_id || null,
        created_by: user.user?.id,
      })
      .select("id, sku, name, sale_price, uom_id, tax_id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/products");
    return {
      ok: true,
      item: {
        id: data.id,
        label: `${data.sku} — ${data.name}`,
        extra: { sale_price: Number(data.sale_price), uom_id: data.uom_id, tax_id: data.tax_id },
      },
    };
  } catch (e) {
    return { ok: false, error: actionError(e, "create products") };
  }
}

function actionError(e: unknown, action: string): string {
  if ((e as { code?: string })?.code === "PERMISSION_DENIED") {
    return `You don't have permission to ${action}.`;
  }
  if (e instanceof z.ZodError) return e.issues[0].message;
  return (e as Error)?.message ?? "Something went wrong";
}

export async function setProductActive(
  id: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(P.inventory.productEdit);
    const supabase = await createClient();
    const { error } = await supabase.from("product").update({ is_active: active }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/products");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: actionError(e, "edit products") };
  }
}

export async function deleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(P.inventory.productDelete);
    const supabase = await createClient();
    const { error } = await supabase.from("product").delete().eq("id", id);
    if (error) return { ok: false, error: friendlyDeleteError(error.message) };
    revalidatePath("/products");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: actionError(e, "delete products") };
  }
}

// Postgres FK-violation (23503) means the row is referenced by documents.
function friendlyDeleteError(message: string): string {
  if (/foreign key|violates|referenced|23503/i.test(message)) {
    return "Can't delete: this record is used by other documents. Deactivate it instead.";
  }
  return message;
}
