import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "@/lib/db/config";

export const dynamic = "force-dynamic";

/**
 * Keep-alive ping for the Supabase project.
 *
 * Free-tier Supabase projects pause after ~7 days with no activity. A daily
 * Vercel cron (see vercel.json) hits this route, which runs one tiny query so
 * the database registers activity and stays awake. Harmless if called manually.
 *
 * If CRON_SECRET is set in the environment, the request must present it
 * (Vercel's cron runner sends `Authorization: Bearer <CRON_SECRET>`).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false },
  });

  // A lightweight query — reaching PostgREST/Postgres is what counts as activity.
  const { error } = await supabase.from("tax_rate").select("id", { head: true, count: "exact" });

  return NextResponse.json({
    ok: !error,
    pingedAt: new Date().toISOString(),
    error: error?.message ?? null,
  });
}
