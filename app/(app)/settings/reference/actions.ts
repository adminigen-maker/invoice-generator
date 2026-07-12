"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { REF_TABLES } from "@/lib/reference-tables";

type Result = { ok: boolean; error?: string };
type Values = Record<string, string>;

function buildRow(table: string, values: Values): Record<string, unknown> {
  const cfg = REF_TABLES[table];
  const row: Record<string, unknown> = {};
  for (const f of cfg.fields) {
    const raw = (values[f.key] ?? "").trim();
    if (f.type === "number") row[f.key] = raw === "" ? 0 : Number(raw);
    else row[f.key] = raw === "" ? null : raw;
  }
  return row;
}

function slug(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "REF";
}

function friendly(msg: string): string {
  if (/duplicate|unique/i.test(msg)) return "That code already exists — use a different one.";
  if (/foreign key|violates|referenced|23503/i.test(msg)) return "Can't delete: this record is used elsewhere.";
  return msg;
}

export async function createRefRow(table: string, values: Values): Promise<Result> {
  const cfg = REF_TABLES[table];
  if (!cfg) return { ok: false, error: "Unknown table." };
  try {
    await requirePermission(cfg.perms.create);
    const supabase = await createClient();
    const row = buildRow(table, values);
    if (cfg.autoCode) {
      const base = slug(String(row[cfg.fields[0].key] ?? ""));
      for (const code of [base, `${base}_${Date.now().toString(36).slice(-4).toUpperCase()}`]) {
        const { error } = await supabase.from(cfg.table).insert({ ...row, code });
        if (!error) {
          revalidatePath("/settings/reference");
          return { ok: true };
        }
        if (!/duplicate|unique/i.test(error.message)) return { ok: false, error: friendly(error.message) };
      }
      return { ok: false, error: "Couldn't generate a unique code." };
    }
    const { error } = await supabase.from(cfg.table).insert(row);
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath("/settings/reference");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permErr(e, `add ${cfg.singular}`) };
  }
}

export async function updateRefRow(table: string, id: string, values: Values): Promise<Result> {
  const cfg = REF_TABLES[table];
  if (!cfg) return { ok: false, error: "Unknown table." };
  try {
    await requirePermission(cfg.perms.edit);
    const supabase = await createClient();
    const { error } = await supabase.from(cfg.table).update(buildRow(table, values)).eq("id", id);
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath("/settings/reference");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permErr(e, `edit ${cfg.singular}`) };
  }
}

export async function deleteRefRow(table: string, id: string): Promise<Result> {
  const cfg = REF_TABLES[table];
  if (!cfg) return { ok: false, error: "Unknown table." };
  try {
    await requirePermission(cfg.perms.del);
    const supabase = await createClient();
    const { error } = await supabase.from(cfg.table).delete().eq("id", id);
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath("/settings/reference");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permErr(e, `delete ${cfg.singular}`) };
  }
}

function permErr(e: unknown, action: string): string {
  if ((e as { code?: string })?.code === "PERMISSION_DENIED") return `You don't have permission to ${action}.`;
  return (e as Error)?.message ?? "Something went wrong";
}
