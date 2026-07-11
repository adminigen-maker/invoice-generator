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
  // Resolve the full effective permission set in ONE round trip via the
  // my_permission_codes() RPC (role grants ∪ positive overrides − negative
  // overrides). Replaces the previous getUser + 3-query chain. Uses auth.uid()
  // internally, so an anonymous caller simply gets an empty set.
  const { data, error } = await supabase.rpc("my_permission_codes");
  if (error || !data) return new Set();
  return new Set(data as string[]);
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
