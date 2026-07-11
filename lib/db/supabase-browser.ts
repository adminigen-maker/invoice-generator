import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. RLS applies. Never trust output as authoritative
 * for mutations — always mirror the check in a server action.
 */
export function createClient() {
  // .trim() defends against a stray BOM / non-breaking space sneaking in via
  // a copy-pasted env var, which otherwise makes the auth headers non-Latin-1.
  return createBrowserClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()
  );
}
