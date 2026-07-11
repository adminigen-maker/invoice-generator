import { createClient } from "@/lib/db/supabase-server";
import { cache } from "react";
import { getPermissions } from "./can";

/**
 * Layer 3 of RBAC — field-level masking.
 *
 * Strips columns like `cost_price`, `margin` from responses when the
 * current user's roles lack the required view permission.
 *
 * Usage:
 *   const rows = await supabase.from("product").select("*");
 *   return maskFields("product", rows.data);
 */
const getFieldRules = cache(async (): Promise<Map<string, Array<{ field: string; perm: string }>>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("field_permission").select("*");
  const map = new Map<string, Array<{ field: string; perm: string }>>();
  for (const row of data ?? []) {
    const bucket = map.get(row.table_name) ?? [];
    bucket.push({ field: row.field_name, perm: row.required_permission });
    map.set(row.table_name, bucket);
  }
  return map;
});

export async function maskFields<T extends Record<string, unknown>>(
  tableName: string,
  rows: T[] | T | null
): Promise<T[] | T | null> {
  if (!rows) return rows;
  const [rules, perms] = await Promise.all([getFieldRules(), getPermissions()]);
  const tableRules = rules.get(tableName);
  if (!tableRules?.length) return rows;

  const toStrip = tableRules.filter((r) => !perms.has(r.perm)).map((r) => r.field);
  if (!toStrip.length) return rows;

  const mask = (r: T) => {
    const copy: Record<string, unknown> = { ...r };
    for (const f of toStrip) delete copy[f];
    return copy as T;
  };

  return Array.isArray(rows) ? rows.map(mask) : mask(rows);
}
