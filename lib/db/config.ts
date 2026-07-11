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
  // Must be a complete Supabase project URL. A tab/whitespace-mangled value
  // fails this (after cleanEnv strips the junk it still has to match exactly).
  return /^https:\/\/[a-z0-9]{16,}\.supabase\.co$/.test(v) ? v : FALLBACK_SUPABASE_URL;
}

export function supabaseAnonKey(): string {
  const v = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  // Accept an env key ONLY if it is *structurally complete*:
  //   - a JWT: three base64url segments (≥20 chars each) split by dots, OR
  //   - a modern publishable key (sb_publishable_…).
  // A key that lost characters to paste corruption cannot satisfy this, so it
  // deterministically falls back to the known-good public key below.
  const isCompleteJwt = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/.test(v);
  const isPublishable = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(v);
  return isCompleteJwt || isPublishable ? v : FALLBACK_SUPABASE_ANON_KEY;
}
