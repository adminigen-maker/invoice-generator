import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { demoModeFrom, isDemoMode, isLocalHost } from "@/lib/demo-mode";

describe("demoModeFrom (the rule: an allowlist)", () => {
  it("is on only when the flag is exactly 'true' and the environment is development or test", () => {
    expect(demoModeFrom("true", "development")).toBe(true);
    expect(demoModeFrom("true", "test")).toBe(true);
  });

  it("is never on in production, even with the flag set", () => {
    expect(demoModeFrom("true", "production")).toBe(false);
  });

  it("is off for any environment that is not clearly local: staging, a typo, or none at all", () => {
    for (const env of ["staging", "preview", "prod", "Production", "", undefined]) {
      expect(demoModeFrom("true", env)).toBe(false);
    }
  });

  it("is off when the flag is missing or is not exactly 'true'", () => {
    for (const flag of [undefined, "", "false", "TRUE", "True", "1", "yes", " true", "true "]) {
      expect(demoModeFrom(flag, "development")).toBe(false);
    }
  });
});

describe("isDemoMode (what the app calls)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the real environment: on in development, OFF in a production build", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(isDemoMode()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isDemoMode()).toBe(false);
    vi.stubEnv("NODE_ENV", "staging");
    expect(isDemoMode()).toBe(false);
  });

  it("is off when the flag is not set at all (the variable does not exist)", () => {
    const before = process.env.NEXT_PUBLIC_DEMO_MODE;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    try {
      vi.stubEnv("NODE_ENV", "development");
      expect(isDemoMode()).toBe(false);
    } finally {
      if (before !== undefined) process.env.NEXT_PUBLIC_DEMO_MODE = before;
    }
  });
});

describe("isLocalHost (demo mode only answers this PC)", () => {
  it("accepts the names that mean this PC", () => {
    for (const h of ["localhost", "LOCALHOST", "127.0.0.1", "[::1]", "::1"]) {
      expect(isLocalHost(h)).toBe(true);
    }
  });

  it("refuses LAN addresses, tunnels, look-alikes and empty values", () => {
    for (const h of ["192.168.1.20", "10.0.0.5", "0.0.0.0", "my-app.ngrok.app", "localhost.evil.com", "127.0.0.1.evil.com", "", null, undefined]) {
      expect(isLocalHost(h)).toBe(false);
    }
  });
});

/**
 * "Exactly one reader": no source file except lib/demo-mode.ts may mention the flag.
 * Skipped at the TOP LEVEL only: build output, git, this tests folder (and dist/out/coverage/.vercel/.turbo).
 * Dependencies, .next and .git are skipped at any depth. Anything else is scanned wherever it sits, so a
 * file such as app/out/page.tsx is still caught. Known gap, accepted: it is a text search, so a key built at
 * run time (process.env[name]) would not be seen; the rubric review covers that.
 */
const ALWAYS_SKIP = new Set(["node_modules", ".next", ".git"]);
const TOP_LEVEL_SKIP = new Set([".vercel", ".turbo", "dist", "out", "coverage", "tests"]);
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function findReaders(root: string, needle = "NEXT_PUBLIC_DEMO_MODE"): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (ALWAYS_SKIP.has(name) || (dir === root && TOP_LEVEL_SKIP.has(name))) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (CODE_FILE.test(name) && readFileSync(full, "utf8").includes(needle)) {
        found.push(relative(root, full).split("\\").join("/"));
      }
    }
  };
  walk(root);
  return found.sort();
}

describe("the demo flag has exactly one reader", () => {
  it("only lib/demo-mode.ts mentions NEXT_PUBLIC_DEMO_MODE in the real repo", () => {
    expect(findReaders(process.cwd())).toEqual(["lib/demo-mode.ts"]);
  });

  it("the scan itself works: it catches a reader hiding in a nested folder named like a skipped one", () => {
    const root = mkdtempSync(join(tmpdir(), "demo-scan-"));
    try {
      for (const dir of ["app/out", "app/tests", "lib/dist", "tests", "out"]) mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, "app/out/page.tsx"), "const f = process.env.NEXT_PUBLIC_DEMO_MODE;");     // nested "out": must be caught
      writeFileSync(join(root, "app/tests/x.ts"), "const f = process.env.NEXT_PUBLIC_DEMO_MODE;");        // nested "tests": must be caught
      writeFileSync(join(root, "lib/dist/y.ts"), "const f = process.env.NEXT_PUBLIC_DEMO_MODE;");         // nested "dist": must be caught
      writeFileSync(join(root, "tests/own.test.ts"), "stubEnv('NEXT_PUBLIC_DEMO_MODE')");                // top-level tests: skipped on purpose
      writeFileSync(join(root, "out/build.js"), "NEXT_PUBLIC_DEMO_MODE");                                // top-level out: skipped on purpose
      writeFileSync(join(root, "README.md"), "NEXT_PUBLIC_DEMO_MODE is documented here");                // not code: ignored
      expect(findReaders(root)).toEqual(["app/out/page.tsx", "app/tests/x.ts", "lib/dist/y.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
