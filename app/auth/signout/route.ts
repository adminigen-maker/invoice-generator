import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase-server";

/**
 * Resolve the app's public origin without requiring a manually-set env var.
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL      — explicit override, if set
 *   2. VERCEL_PROJECT_PRODUCTION_URL — stable production domain on Vercel
 *   3. the incoming request's own origin — works on localhost & preview deploys
 */
function resolveOrigin(request: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", resolveOrigin(request)), {
    status: 303, // force GET on the redirected /login request
  });
}
