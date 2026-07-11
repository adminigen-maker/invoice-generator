import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "./config";

/**
 * Browser-side Supabase client. RLS applies. Never trust output as authoritative
 * for mutations — always mirror the check in a server action.
 */
export function createClient() {
  // URL + anon key are resolved via config.ts, which sanitizes the env value
  // and falls back to the known-correct public value if it is corrupt/unset.
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
