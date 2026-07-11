import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. BYPASSES RLS. Use only for:
 *   - Seeding
 *   - System-level tasks (cron jobs, background workers)
 *   - Bootstrapping an admin user before any user exists
 *
 * NEVER import from client-side code or expose the key.
 */
export function createAdminClient() {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

  return createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
