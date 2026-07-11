import { createClient } from "@/lib/db/supabase-server";
import { cache } from "react";

/**
 * Layer 1 of RBAC — module/action check.
 *
 * Call BEFORE every mutation in a server action, and before rendering a
 * server component that shows sensitive UI. The DB has a matching
 * `has_permission()` SQL function that RLS uses as the safety net —
 * this app-side check gives clean 403s and cheap UI gating.
 *
 * Result is per-request cached to avoid repeated round-trips.
 */
export const getPermissions = cache(async (): Promise<Set<string>> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  // 1. Look up user's roles.
  const { data: userRoles } = await supabase
    .from("user_role")
    .select("role_id")
    .eq("user_id", user.id);
  const roleIds = (userRoles ?? []).map((r) => r.role_id as string);

  // 2. Fetch role permissions and per-user overrides in parallel.
  const [{ data: rolePerms }, { data: overrides }] = await Promise.all([
    roleIds.length
      ? supabase
          .from("role_permission")
          .select("permission:app_permission(code)")
          .in("role_id", roleIds)
      : Promise.resolve({ data: [] as Array<{ permission: { code?: string } | null }> }),
    supabase
      .from("user_permission_override")
      .select("granted, permission:app_permission(code)")
      .eq("user_id", user.id),
  ]);

  const codes = new Set<string>();
  for (const row of rolePerms ?? []) {
    const p = row.permission as { code?: string } | null;
    if (p?.code) codes.add(p.code);
  }
  for (const row of overrides ?? []) {
    const p = row.permission as { code?: string } | null;
    if (!p?.code) continue;
    if (row.granted) codes.add(p.code);
    else codes.delete(p.code);
  }
  return codes;
});

export async function can(perm: string): Promise<boolean> {
  const perms = await getPermissions();
  return perms.has(perm);
}

export async function canAny(...perms: string[]): Promise<boolean> {
  const set = await getPermissions();
  return perms.some((p) => set.has(p));
}

export async function requirePermission(perm: string): Promise<void> {
  if (!(await can(perm))) {
    throw new PermissionDeniedError(perm);
  }
}

export class PermissionDeniedError extends Error {
  code = "PERMISSION_DENIED" as const;
  constructor(public perm: string) {
    super(`Permission denied: ${perm}`);
  }
}
