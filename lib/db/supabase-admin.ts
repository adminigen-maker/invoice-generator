import "server-only"; // build fails if this service-role module is ever imported client-side
import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "./clean-env";
import { supabaseUrl } from "./config";

/**
 * Service-role client. BYPASSES RLS. Use only for:
 *   - Seeding
 *   - System-level tasks (cron jobs, background workers)
 *   - Bootstrapping an admin user before any user exists
 *   - Admin actions that must reach auth (e.g. creating a login account),
 *     always AFTER checking the caller's permission on their own session.
 *
 * NEVER import from client-side code or expose the key.
 *
 * A placeholder value (e.g. the ".env.example" stub) is treated as unset so
 * callers get the clear "not configured" path instead of a 401 at runtime.
 */
export function createAdminClient() {
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const looksReal = key.length >= 40 && !/your-|paste-|here|example|xxxx/i.test(key);
  if (!looksReal) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

  // The URL is public; reuse the resilient resolver so a mangled/absent
  // NEXT_PUBLIC_SUPABASE_URL can't break admin actions. The secret key still
  // comes only from the environment.
  return createClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
