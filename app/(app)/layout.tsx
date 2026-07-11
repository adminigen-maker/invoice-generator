import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentUser } from "@/lib/db/current-user";
import { getPermissions } from "@/lib/rbac/can";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // Permissions (RPC) and the profile lookup are independent — both only need
  // the already-known user — so run them together instead of serially.
  const [perms, { data: profile }] = await Promise.all([
    getPermissions(),
    supabase.from("app_user").select("display_name, email").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <AppShell
      permissions={Array.from(perms)}
      userName={profile?.display_name ?? user.email ?? "User"}
      userEmail={profile?.email ?? user.email ?? ""}
    >
      {children}
    </AppShell>
  );
}
