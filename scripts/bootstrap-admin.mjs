/**
 * Bootstrap the very first admin user.
 *
 * Usage:
 *   node scripts/bootstrap-admin.mjs admin@example.com "StrongPass!1" "Full Name"
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (or as an env var).
 * Uses the service role client — bypasses RLS. Only run this once.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) process.env[m[1]] ??= m[2].replace(/^"|"$/g, "");
    }
  } catch { /* not required if env is already set */ }
}
loadEnv();

const [, , email, password, displayName] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <email> <password> [displayName]");
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: existing } = await supabase.auth.admin.listUsers();
let user = existing?.users?.find((u) => u.email === email);

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) { console.error("Create user failed:", error.message); process.exit(1); }
  user = data.user;
  console.log("✔ Created auth user:", email);
} else {
  console.log("✔ Auth user already exists:", email);
}

await supabase.from("app_user").upsert({
  id: user.id,
  email,
  display_name: displayName ?? email,
  is_active: true,
});
console.log("✔ Ensured app_user row");

const { data: adminRole } = await supabase.from("role").select("id").eq("code", "admin").maybeSingle();
if (!adminRole) { console.error("Admin role not seeded — run migration 0008 first."); process.exit(1); }

await supabase.from("user_role").upsert({
  user_id: user.id,
  role_id: adminRole.id,
  scope: "all",
});
console.log("✔ Assigned admin role");
console.log("\nDone. Sign in at http://localhost:3000/login");
