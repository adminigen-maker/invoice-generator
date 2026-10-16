import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The real middleware, with Supabase faked: "no signed-in user". So when the demo branch is NOT taken, the
// request goes down the real-auth path and an unauthenticated page request is redirected to /login.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/lib/db/config", () => ({ supabaseUrl: () => "http://supabase.invalid", supabaseAnonKey: () => "anon" }));

async function loadMiddleware(flag: string, nodeEnv: string) {
  vi.resetModules();                                   // the demo flag is read once, when the module is imported
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", flag);
  vi.stubEnv("NODE_ENV", nodeEnv);
  return (await import("../middleware")).middleware;
}

const get = (url: string, cookie?: string) =>
  new NextRequest(url, cookie ? { headers: { cookie } } : undefined);

const redirectPath = (res: Response) => {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname : null;
};

describe("middleware demo branch (new local-host gate)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("on this PC, with the flag on in development: no cookie -> sent to /login", async () => {
    const mw = await loadMiddleware("true", "development");
    expect(redirectPath(await mw(get("http://localhost:3000/invoices")))).toBe("/login");
  });

  it("on this PC, with the demo cookie: the page is let through, and /login sends you home", async () => {
    const mw = await loadMiddleware("true", "development");
    expect(redirectPath(await mw(get("http://localhost:3000/invoices", "demo-session=1")))).toBeNull();
    expect(redirectPath(await mw(get("http://127.0.0.1:3000/login", "demo-session=1")))).toBe("/");
  });

  it("public paths stay reachable without the cookie", async () => {
    const mw = await loadMiddleware("true", "development");
    for (const p of ["/login", "/_next/static/x.js", "/logo.png"]) {
      expect(redirectPath(await mw(get("http://localhost:3000" + p)))).toBeNull();
    }
  });

  it("from a LAN address or a tunnel name the demo cookie is NOT honoured (real auth path: sent to /login)", async () => {
    const mw = await loadMiddleware("true", "development");
    for (const host of ["http://192.168.1.20:3000", "https://my-app.ngrok.app"]) {
      expect(redirectPath(await mw(get(host + "/invoices", "demo-session=1")))).toBe("/login");
    }
  });

  it("in production the demo cookie is never honoured, even with the flag on and a local host", async () => {
    const mw = await loadMiddleware("true", "production");
    expect(redirectPath(await mw(get("http://localhost:3000/invoices", "demo-session=1")))).toBe("/login");
  });

  it("with the flag off the demo cookie is ignored", async () => {
    const mw = await loadMiddleware("", "development");
    expect(redirectPath(await mw(get("http://localhost:3000/invoices", "demo-session=1")))).toBe("/login");
  });

  it("staging-like environments are off too (the allowlist)", async () => {
    const mw = await loadMiddleware("true", "staging");
    expect(redirectPath(await mw(get("http://localhost:3000/invoices", "demo-session=1")))).toBe("/login");
  });
});
