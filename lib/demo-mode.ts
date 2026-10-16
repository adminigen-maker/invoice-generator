/**
 * Demo mode: a LOCAL-ONLY login bypass (a fake admin, every permission, no field masking)
 * for running the app on a PC without a database.
 *
 * Three guards. Guards 1 and 2 apply everywhere demo mode is used (the helper below); guard 3 applies
 * only where stated:
 *  1. NEXT_PUBLIC_DEMO_MODE is exactly "true".
 *  2. NODE_ENV is an ALLOWLISTED value ("development" or "test"). A production build, and any
 *     unknown value such as "staging", turns demo mode OFF.
 *  3. In the middleware's PAGE routing only, requests must carry a local Host (see `isLocalHost`):
 *     `next dev` listens on the whole network by default, so this stops an ACCIDENTAL phone, LAN or
 *     tunnel visit to the pages. It does NOT cover the server helpers (getCurrentUser, getPermissions,
 *     getFieldRules), which trust the flag alone, and a client can fake the Host header, so it is not
 *     authentication. For a real guarantee run `npm run dev -- -H 127.0.0.1`. The demo cookie is a plain
 *     "1". These are documented residual risks (ticket spec, amendment 4), not fixed here.
 *
 * Keep the two `process.env.X` reads in `isDemoMode` LITERAL: Next.js only substitutes literal
 * `process.env.NEXT_PUBLIC_*` and `process.env.NODE_ENV` expressions in browser and edge code,
 * so passing the whole `process.env` object around would silently return false there.
 *
 * This is the ONLY file allowed to read NEXT_PUBLIC_DEMO_MODE (tests/demo-mode.test.ts enforces it).
 */

/** The rule itself, with explicit inputs so it can be tested exactly. An allowlist, not a denylist. */
export function demoModeFrom(
  flag: string | undefined,
  nodeEnv: string | undefined
): boolean {
  return flag === "true" && (nodeEnv === "development" || nodeEnv === "test");
}

/** The cookie the demo login sets and the middleware reads (one name, defined once). */
export const DEMO_COOKIE_NAME = "demo-session";

/** What the app calls. */
export function isDemoMode(): boolean {
  return demoModeFrom(
    process.env.NEXT_PUBLIC_DEMO_MODE,
    process.env.NODE_ENV
  );
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** True only for a host name that means "this PC". Anything else (a LAN IP, a tunnel name) is not local. */
export function isLocalHost(hostname: string | null | undefined): boolean {
  return !!hostname && LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}
