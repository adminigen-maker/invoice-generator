"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission, can } from "@/lib/rbac/can";
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

// Extra selling units for a product (Box, Carton, …). The BASE unit lives on the
// product itself (uom_id / sale_price / cost_price, implicit factor 1); these are
// additional units, each with how many base units it equals and its own price.
const productUomRowSchema = z.object({
  uom_id: z.string().uuid(),
  // Bounded so a value can't overflow numeric(18,6)/(18,4) at INSERT time (which
  // would fail mid-save); rejected up front with a friendly message instead.
  factor: z.coerce.number().positive("Base-unit quantity must be greater than 0").max(1_000_000, "Base-unit quantity is too large"),
  sale_price: z.coerce.number().min(0).max(1_000_000_000, "Price is too large").default(0),
  cost_price: z.coerce.number().min(0).max(1_000_000_000, "Price is too large").default(0),
});
type ProductUomRow = z.infer<typeof productUomRowSchema>;

/** Read + validate the JSON `extra_uoms` field. Throws (caught → friendly error). */
function parseExtraUoms(fd: FormData, baseUomId: string): ProductUomRow[] {
  const raw = fd.get("extra_uoms");
  if (typeof raw !== "string" || !raw.trim()) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new Error("Additional units are malformed.");
  }
  // Non-array but valid JSON ("null", "{}", …) must NOT be treated as an
  // intentional clear-all — fail closed rather than silently deleting all units.
  if (!Array.isArray(arr)) throw new Error("Additional units are malformed.");
  const rows = arr
    .filter((r) => r && typeof r === "object" && (r as { uom_id?: string }).uom_id) // drop blank rows
    .map((r) => productUomRowSchema.parse(r));
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.uom_id === baseUomId) throw new Error("An additional unit can't be the same as the base unit.");
    if (seen.has(r.uom_id)) throw new Error("Each additional unit can only be listed once.");
    seen.add(r.uom_id);
  }
  return rows;
}

/**
 * Reconcile a product's extra units to `rows`. Upsert the desired rows FIRST,
 * then delete only the units no longer present — so if the write fails, the
 * existing units survive (a delete-then-insert would wipe them all on any insert
 * error). When the caller can't view cost, each existing unit's cost_price is
 * preserved instead of writing the 0 the client sent (it never had the real one),
 * so editing sale prices as a non-cost user can't silently wipe costs.
 */
async function saveProductUoms(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  rows: ProductUomRow[],
  canWriteCost: boolean,
) {
  let costByUom = new Map<string, number>();
  if (!canWriteCost) {
    const { data: existing } = await supabase
      .from("product_uom").select("uom_id, cost_price").eq("product_id", productId);
    costByUom = new Map((existing ?? []).map((r) => [r.uom_id as string, Number(r.cost_price)]));
  }
  if (rows.length) {
    const { error: upErr } = await supabase.from("product_uom").upsert(
      rows.map((r, i) => ({
        product_id: productId,
        uom_id: r.uom_id,
        factor: r.factor,
        sale_price: r.sale_price,
        cost_price: canWriteCost ? r.cost_price : costByUom.get(r.uom_id) ?? 0,
        sequence: i,
      })),
      { onConflict: "product_id,uom_id" },
    );
    if (upErr) throw new Error(upErr.message);
  }
  // Drop units the user removed (all of them when `rows` is empty).
  const keep = rows.map((r) => r.uom_id);
  let del = supabase.from("product_uom").delete().eq("product_id", productId);
  if (keep.length) del = del.not("uom_id", "in", `(${keep.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) throw new Error(delErr.message);
}

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
    const extraUoms = parseExtraUoms(fd, input.uom_id); // validate before any write
    const supabase = await createClient();
    if (!input.sku) input.sku = await nextSku(supabase);
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("product")
      .insert({ ...input, created_by: user.user?.id })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    try {
      await saveProductUoms(supabase, data.id, extraUoms, await can(P.inventory.productViewCost));
    } catch (e) {
      // The product committed before its units; if the units fail, remove the
      // orphan so a retry doesn't create a duplicate (best effort — needs delete rights).
      await supabase.from("product").delete().eq("id", data.id);
      throw e;
    }
    revalidatePath("/products");
    revalidatePath(`/products/${data.id}`);
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: actionError(e, "create products") };
  }
}

export async function updateProduct(id: string, fd: FormData): Promise<FormResult> {
  try {
    await requirePermission(P.inventory.productEdit);
    const input = parseForm(fd);
    const extraUoms = parseExtraUoms(fd, input.uom_id); // validate before any write
    const canCost = await can(P.inventory.productViewCost);
    const supabase = await createClient();
    // Never blank out an existing SKU on edit.
    const patch = { ...input };
    if (!patch.sku) delete patch.sku;
    // A user who can't see cost never submits it — parseForm defaults the missing
    // field to 0, which must not overwrite the real master cost.
    if (!canCost) delete (patch as Record<string, unknown>).cost_price;
    const { error } = await supabase.from("product").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await saveProductUoms(supabase, id, extraUoms, canCost);
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

// Inline category creation used by the "+ New category" quick-add on the form.
const quickCategorySchema = z.object({ name: z.string().trim().min(1, "Name required").max(60) });
export type QuickCategory = { id: string; label: string };

export async function quickCreateCategory(
  input: unknown
): Promise<{ ok: true; item: QuickCategory } | { ok: false; error: string }> {
  try {
    await requirePermission(P.inventory.productCreate);
    const v = quickCategorySchema.parse(input);
    const supabase = await createClient();
    const base =
      v.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "CAT";
    // product_category.code is required + unique; derive from the name and retry
    // once with a suffix on collision.
    for (const code of [base, `${base}_${Date.now().toString(36).slice(-4).toUpperCase()}`]) {
      const { data, error } = await supabase
        .from("product_category")
        .insert({ code, name: v.name })
        .select("id, name")
        .single();
      if (!error) {
        revalidatePath("/products");
        return { ok: true, item: { id: data.id, label: data.name } };
      }
      if (!/duplicate|unique/i.test(error.message)) return { ok: false, error: error.message };
    }
    return { ok: false, error: "Couldn't generate a unique category code — try a different name." };
  } catch (e) {
    return { ok: false, error: actionError(e, "create categories") };
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
