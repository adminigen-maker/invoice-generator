import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getCurrentUser } from "@/lib/db/current-user";
import { getPermissions } from "@/lib/rbac/can";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

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
    <div className="flex h-dvh overflow-hidden">
      <Sidebar permissions={Array.from(perms)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          userEmail={profile?.email ?? user.email ?? ""}
          userName={profile?.display_name ?? user.email ?? "User"}
          permissions={Array.from(perms)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/20">{children}</main>
      </div>
    </div>
  );
}
