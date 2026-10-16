import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabaseAnonKey } from "@/lib/db/config";
import { DEMO_COOKIE_NAME, isDemoMode, isLocalHost } from "@/lib/demo-mode";

const DEMO_MODE = isDemoMode();

/**
 * Refresh the Supabase session cookie on every request and gate app routes
 * behind auth. Public routes: /login, /auth/*, static assets.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Page routing only: the demo branch is taken only when the Host is this PC. This guards against ACCIDENTAL
  // exposure (a phone, a tunnel). It does not cover the server helpers (getCurrentUser, getPermissions,
  // getFieldRules), which trust the flag alone, and a client can fake the Host header, so it is not
  // authentication. The real control: run the dev server on loopback, `npm run dev -- -H 127.0.0.1`.
  if (DEMO_MODE && isLocalHost(request.nextUrl.hostname)) {
    const isLoggedIn = request.cookies.get(DEMO_COOKIE_NAME)?.value === "1";
    const { pathname } = request.nextUrl;
    const isPublic =
      pathname.startsWith("/login") ||
      pathname.startsWith("/auth") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      /\.(png|jpe?g|gif|webp|svg|ico|txt|xml)$/.test(pathname);

    if (!isLoggedIn && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (isLoggedIn && pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return response;
  }

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
    pathname.startsWith("/api") || // API routes handle their own auth (e.g. cron keep-alive)
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
