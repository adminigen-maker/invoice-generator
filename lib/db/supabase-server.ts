import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cleanEnv } from "./clean-env";

/**
 * Server-side Supabase client bound to the request cookies.
 * Runs under the *user's* JWT — RLS applies.
 * Use this in server components, route handlers, and server actions.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // set from a server component: refresh will re-hydrate the session.
          }
        },
      },
    }
  );
}
