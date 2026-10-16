import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The three server helpers that grant demo access when the flag is on. Supabase is faked so that taking the
// REAL path is detectable: createClient throws "REAL_PATH_TAKEN". So "demo path not taken" = that error appears.
const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(async () => {
    throw new Error("REAL_PATH_TAKEN");
  }),
}));
vi.mock("@/lib/db/supabase-server", () => ({ createClient }));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));   // React's cache() exists only in the server build of React

async function load(flag: string, nodeEnv: string) {
  vi.resetModules();                                       // each helper reads the flag once, when it is imported
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", flag);
  vi.stubEnv("NODE_ENV", nodeEnv);
  const can = await import("@/lib/rbac/can");
  const user = await import("@/lib/db/current-user");
  const fields = await import("@/lib/rbac/field-filter");
  const perms = await import("@/lib/rbac/permissions");
  return { can, user, fields, perms };
}

describe("demo branches of getPermissions / getCurrentUser / maskFields", () => {
  // Braces matter: a hook that RETURNS a function makes Vitest call it as a cleanup step.
  beforeEach(() => {
    createClient.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("POSITIVE CONTROL: in development with the flag on, all three take the demo path (Supabase is never called)", async () => {
    const { can, user, fields, perms } = await load("true", "development");
    const anyPerm = Object.values(Object.values(perms.P)[0])[0] as string;
    const set = await can.getPermissions();
    expect(set.size).toBeGreaterThan(0);
    expect(set.has(anyPerm)).toBe(true);
    expect((await user.getCurrentUser())?.email).toBe("admin@demo.local");
    const rows = [{ sku: "A", cost_price: 5 }];
    expect(await fields.maskFields("product", rows)).toEqual(rows);          // nothing is stripped in demo mode
    expect(createClient).not.toHaveBeenCalled();
  });

  for (const [label, flag, env] of [
    ["a production build, flag on", "true", "production"],
    ["staging, flag on", "true", "staging"],
    ["development, flag off", "", "development"],
    ["development, flag 'TRUE' (not exact)", "TRUE", "development"],
  ] as const) {
    it(`${label}: none of the three takes the demo path (each goes to the real Supabase path)`, async () => {
      const { can, user, fields } = await load(flag, env);
      await expect(can.getPermissions()).rejects.toThrow("REAL_PATH_TAKEN");
      await expect(user.getCurrentUser()).rejects.toThrow("REAL_PATH_TAKEN");
      await expect(fields.maskFields("product", [{ cost_price: 5 }])).rejects.toThrow("REAL_PATH_TAKEN");
      expect(createClient).toHaveBeenCalled();
    });
  }
});
