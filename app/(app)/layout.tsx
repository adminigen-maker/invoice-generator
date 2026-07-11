import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { getPermissions } from "@/lib/rbac/can";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const perms = await getPermissions();
  const { data: profile } = await supabase
    .from("app_user")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen flex">
      <Sidebar permissions={Array.from(perms)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          userEmail={profile?.email ?? user.email ?? ""}
          userName={profile?.display_name ?? user.email ?? "User"}
        />
        <main className="flex-1 overflow-y-auto p-6 bg-muted/20">{children}</main>
      </div>
    </div>
  );
}
