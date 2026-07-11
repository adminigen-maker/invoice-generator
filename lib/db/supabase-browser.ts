import { createBrowserClient } from "@supabase/ssr";
import { cleanEnv } from "./clean-env";

/**
 * Browser-side Supabase client. RLS applies. Never trust output as authoritative
 * for mutations — always mirror the check in a server action.
 */
export function createClient() {
  // cleanEnv() strips invisible characters a copy-pasted env var may carry,
  // which otherwise make the auth headers non-Latin-1 and crash fetch().
  return createBrowserClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
