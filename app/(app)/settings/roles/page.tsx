import { createClient } from "@/lib/db/supabase-server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }, { data: rolePerms }, { data: users }] = await Promise.all([
    supabase.from("role").select("*").order("code"),
    supabase.from("app_permission").select("*").order("module"),
    supabase.from("role_permission").select("role_id, permission_id"),
    supabase.from("app_user").select("id, email, display_name, is_active"),
  ]);

  const rpMap = new Map<string, Set<string>>();
  for (const rp of rolePerms ?? []) {
    const s = rpMap.get(rp.role_id) ?? new Set();
    s.add(rp.permission_id);
    rpMap.set(rp.role_id, s);
  }
  const modules = Array.from(new Set((perms ?? []).map((p) => p.module)));

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roles & Users</h1>
        <p className="text-sm text-muted-foreground">Layer 1 (module/action) permission matrix. Assign roles to users in the Users tab.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Users</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">Email</th><th>Name</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-1.5 font-mono text-xs">{u.email}</td>
                  <td>{u.display_name}</td>
                  <td>{u.is_active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            User creation UI ships in the next iteration. Create users via Supabase Auth, then insert an <code className="rounded bg-muted px-1">app_user</code> row and assign roles.
          </p>
        </CardContent>
      </Card>

      {modules.map((mod) => (
        <Card key={mod}>
          <CardHeader>
            <CardTitle className="text-base capitalize">{mod} permissions</CardTitle>
            <CardDescription>Which roles hold each capability</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Permission</th>
                  {(roles ?? []).map((r) => (
                    <th key={r.id} className="p-2 text-center whitespace-nowrap">{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(perms ?? []).filter((p) => p.module === mod).map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2">
                      <div className="font-mono">{p.code}</div>
                      <div className="text-muted-foreground">{p.description}</div>
                    </td>
                    {(roles ?? []).map((r) => (
                      <td key={r.id} className="p-2 text-center">
                        {rpMap.get(r.id)?.has(p.id) ? "✓" : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
