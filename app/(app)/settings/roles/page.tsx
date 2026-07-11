import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/supabase-server";
import { can } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";
import { RolesAdmin, type PermLite } from "./roles-admin";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  if (!(await can(P.admin.rolesView))) redirect("/");

  const supabase = await createClient();
  const [{ data: roles }, { data: perms }, { data: rolePerms }, { data: users }, canEditRoles, canEditUsers] =
    await Promise.all([
      supabase.from("role").select("id, code, name").order("code"),
      supabase.from("app_permission").select("id, code, module, action, description").order("module").order("code"),
      supabase.from("role_permission").select("role_id, permission_id"),
      supabase
        .from("app_user")
        .select("id, email, display_name, is_active, roles:user_role(role_id, scope)")
        .order("email"),
      can(P.admin.rolesEdit),
      can(P.admin.usersEdit),
    ]);

  // Group permissions by module.
  const moduleMap = new Map<string, PermLite[]>();
  for (const p of perms ?? []) {
    const arr = moduleMap.get(p.module) ?? [];
    arr.push({ id: p.id, code: p.code, action: p.action, description: p.description });
    moduleMap.set(p.module, arr);
  }
  const permsByModule = Array.from(moduleMap.entries()).map(([module, perms]) => ({ module, perms }));

  const grantedPairs = (rolePerms ?? []).map((rp) => `${rp.role_id}:${rp.permission_id}`);

  const usersLite = (users ?? []).map((u) => {
    const userRoles = (u.roles ?? []) as Array<{ role_id: string; scope: string }>;
    return {
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      is_active: u.is_active,
      roleIds: userRoles.map((r) => r.role_id),
      scope: userRoles[0]?.scope ?? "all",
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roles &amp; Users</h1>
        <p className="text-sm text-muted-foreground">
          Assign roles to users and control what each role can do.
        </p>
      </div>
      <RolesAdmin
        users={usersLite}
        roles={roles ?? []}
        permsByModule={permsByModule}
        grantedPairs={grantedPairs}
        canEditRoles={canEditRoles}
        canEditUsers={canEditUsers}
      />
    </div>
  );
}
