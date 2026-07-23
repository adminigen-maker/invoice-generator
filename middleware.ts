import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey } from "@/lib/db/config";

/**
 * Refresh the Supabase session cookie on every request and gate app routes
 * behind auth. Public routes: /login, /auth/*, static assets.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: CookieOptions }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname === "/api/keep-alive" || // ONLY this cron route is public (self-checks CRON_SECRET); other /api routes require auth
    pathname.startsWith("/_next") ||
    // Static assets (favicons, images) load without a session, e.g. on /login.
    /\.(png|jpe?g|gif|webp|svg|ico|txt|xml)$/.test(pathname);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip the session-refreshing middleware for static assets & the manifest.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpe?g|gif|webp|svg|ico|webmanifest)$).*)"],
};
