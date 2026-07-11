"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toggleRolePermission, toggleUserRole, setUserScope } from "./actions";

export type RoleLite = { id: string; code: string; name: string };
export type PermLite = { id: string; code: string; action: string; description: string | null };
export type UserLite = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  roleIds: string[];
  scope: string;
};

const SCOPES = [
  { value: "all", label: "All records" },
  { value: "team", label: "Team" },
  { value: "branch", label: "Branch" },
  { value: "own", label: "Own only" },
];

export function RolesAdmin({
  users,
  roles,
  permsByModule,
  grantedPairs,
  canEditRoles,
  canEditUsers,
}: {
  users: UserLite[];
  roles: RoleLite[];
  permsByModule: Array<{ module: string; perms: PermLite[] }>;
  grantedPairs: string[];
  canEditRoles: boolean;
  canEditUsers: boolean;
}) {
  const [pending, startTx] = useTransition();

  // Optimistic local state
  const [assigned, setAssigned] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(users.map((u) => [u.id, new Set(u.roleIds)]))
  );
  const [scopes, setScopes] = useState<Record<string, string>>(() =>
    Object.fromEntries(users.map((u) => [u.id, u.scope]))
  );
  const [granted, setGranted] = useState<Set<string>>(() => new Set(grantedPairs));

  function onToggleUserRole(userId: string, roleId: string) {
    if (!canEditUsers) return;
    const has = assigned[userId]?.has(roleId);
    // optimistic
    setAssigned((prev) => {
      const next = new Set(prev[userId] ?? []);
      has ? next.delete(roleId) : next.add(roleId);
      return { ...prev, [userId]: next };
    });
    startTx(async () => {
      const res = await toggleUserRole(userId, roleId, !has, scopes[userId] ?? "all");
      if (!res.ok) {
        // revert
        setAssigned((prev) => {
          const next = new Set(prev[userId] ?? []);
          has ? next.add(roleId) : next.delete(roleId);
          return { ...prev, [userId]: next };
        });
        toast.error(res.error ?? "Failed");
      }
    });
  }

  function onScopeChange(userId: string, scope: string) {
    const prevScope = scopes[userId];
    setScopes((p) => ({ ...p, [userId]: scope }));
    startTx(async () => {
      const res = await setUserScope(userId, scope);
      if (!res.ok) {
        setScopes((p) => ({ ...p, [userId]: prevScope }));
        toast.error(res.error ?? "Failed");
      } else toast.success("Scope updated");
    });
  }

  function onTogglePerm(roleId: string, permId: string) {
    if (!canEditRoles) return;
    const key = `${roleId}:${permId}`;
    const has = granted.has(key);
    setGranted((prev) => {
      const next = new Set(prev);
      has ? next.delete(key) : next.add(key);
      return next;
    });
    startTx(async () => {
      const res = await toggleRolePermission(roleId, permId, !has);
      if (!res.ok) {
        setGranted((prev) => {
          const next = new Set(prev);
          has ? next.add(key) : next.delete(key);
          return next;
        });
        toast.error(res.error ?? "Failed");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Users → roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users &amp; role assignment</CardTitle>
          <CardDescription>
            {canEditUsers
              ? "Click a role to assign or remove it. Data scope applies to that user's assignments."
              : "Read-only — you don't have permission to edit users."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Roles</th>
                <th className="py-2 font-medium w-40">Data scope</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{u.display_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                    {!u.is_active && <Badge variant="secondary" className="mt-1">Inactive</Badge>}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-1.5">
                      {roles.map((r) => {
                        const on = assigned[u.id]?.has(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            disabled={!canEditUsers || pending}
                            onClick={() => onToggleUserRole(u.id, r.id)}
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-60",
                              on
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground hover:bg-accent"
                            )}
                          >
                            {on && <Check className="inline h-3 w-3 mr-1 -mt-0.5" />}
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-3">
                    <select
                      value={scopes[u.id] ?? "all"}
                      disabled={!canEditUsers || pending || (assigned[u.id]?.size ?? 0) === 0}
                      onChange={(e) => onScopeChange(u.id, e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                    >
                      {SCOPES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Roles → permissions matrix */}
      {permsByModule.map(({ module, perms }) => (
        <Card key={module}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base capitalize">{module} permissions</CardTitle>
            <CardDescription>
              {canEditRoles ? "Click a cell to grant or revoke." : "Read-only."}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 font-medium">Permission</th>
                  {roles.map((r) => (
                    <th key={r.id} className="p-2 text-center font-medium whitespace-nowrap">{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perms.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-2">
                      <div className="font-mono">{p.code}</div>
                      {p.description && <div className="text-muted-foreground">{p.description}</div>}
                    </td>
                    {roles.map((r) => {
                      const on = granted.has(`${r.id}:${p.id}`);
                      return (
                        <td key={r.id} className="p-2 text-center">
                          <button
                            type="button"
                            disabled={!canEditRoles || pending}
                            onClick={() => onTogglePerm(r.id, p.id)}
                            aria-pressed={on}
                            className={cn(
                              "h-6 w-6 rounded grid place-items-center border transition-colors disabled:opacity-60 mx-auto",
                              on
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "bg-background border-input hover:bg-accent text-transparent"
                            )}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      );
                    })}
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
