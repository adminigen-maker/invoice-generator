import { cleanEnv } from "./clean-env";

/**
 * Resolve the Supabase URL + anon key, tolerating a broken hosting-dashboard
 * env var.
 *
 * These two values are PUBLIC by design — the anon key ships in every client
 * bundle and is safe to expose; row-level security is what actually protects
 * data. They are baked in here as a fallback so that a mangled env var (leading
 * tab, non-ASCII paste corruption, truncation, or simply unset) cannot take the
 * app down. A *valid* env var always wins, so rotating the key via env keeps
 * working — just paste a clean value and it takes precedence over the fallback.
 *
 * The service-role key is deliberately NOT handled here: it is secret and must
 * only ever come from the environment (see supabase-admin.ts).
 */
const FALLBACK_SUPABASE_URL = "https://jbmrdiwnvkfensfcfagi.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibXJkaXdudmtmZW5zZmNmYWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NDI1MTksImV4cCI6MjA5OTMxODUxOX0.FkBhPFaErV7LKSTjdah6yyhf0GC4QLtWpUr1abITSmg";

export function supabaseUrl(): string {
  const v = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v) ? v : FALLBACK_SUPABASE_URL;
}

export function supabaseAnonKey(): string {
  const v = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  // A usable key is either a Supabase JWT (eyJ…, ~200+ chars) or a modern
  // publishable key (sb_publishable_…). Anything shorter is corruption.
  const looksValid = (v.startsWith("eyJ") && v.length >= 100) || v.startsWith("sb_publishable_");
  return looksValid ? v : FALLBACK_SUPABASE_ANON_KEY;
}
