"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, UserPlus, X, Lock, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  toggleRolePermission,
  toggleUserRole,
  setUserScope,
  createRole,
  deleteRole,
  createUser,
} from "./actions";

export type RoleLite = { id: string; code: string; name: string; is_system?: boolean };
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

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%&*";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 11; i++) out += chars[buf[i] % chars.length];
  out += symbols[buf[11] % symbols.length];
  return out;
}

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
  const router = useRouter();
  const [pending, startTx] = useTransition();

  // Optimistic local state
  const [assigned, setAssigned] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(users.map((u) => [u.id, new Set(u.roleIds)]))
  );
  const [scopes, setScopes] = useState<Record<string, string>>(() =>
    Object.fromEntries(users.map((u) => [u.id, u.scope]))
  );
  const [granted, setGranted] = useState<Set<string>>(() => new Set(grantedPairs));

  // Dialog state
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleLite | null>(null);
  const [busy, setBusy] = useState(false);

  function onToggleUserRole(userId: string, roleId: string) {
    if (!canEditUsers) return;
    const has = assigned[userId]?.has(roleId);
    setAssigned((prev) => {
      const next = new Set(prev[userId] ?? []);
      has ? next.delete(roleId) : next.add(roleId);
      return { ...prev, [userId]: next };
    });
    startTx(async () => {
      const res = await toggleUserRole(userId, roleId, !has, scopes[userId] ?? "all");
      if (!res.ok) {
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

  async function onCreateRole(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await createRole({
      code: String(fd.get("code") ?? ""),
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Role created");
    setAddRoleOpen(false);
    router.refresh();
  }

  async function onCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await createUser({
      email: String(fd.get("email") ?? ""),
      displayName: String(fd.get("displayName") ?? ""),
      password: String(fd.get("password") ?? ""),
      roleId: String(fd.get("roleId") ?? ""),
      scope: String(fd.get("scope") ?? "all"),
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("User created");
    setAddUserOpen(false);
    router.refresh();
  }

  function onDeleteRole() {
    if (!roleToDelete) return;
    const role = roleToDelete;
    setBusy(true);
    startTx(async () => {
      const res = await deleteRole(role.id);
      setBusy(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Role deleted");
      setRoleToDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Roles overview + add */}
      {canEditRoles && (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">Roles</CardTitle>
              <CardDescription>Groups of permissions you assign to users.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAddRoleOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />Add role
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="font-mono text-muted-foreground">{r.code}</span>
                  {r.is_system ? (
                    <Lock className="h-3 w-3 text-muted-foreground" aria-label="System role" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRoleToDelete(r)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete role ${r.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users → roles */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Users &amp; role assignment</CardTitle>
            <CardDescription>
              {canEditUsers
                ? "Click a role to assign or remove it. Data scope applies to that user's assignments."
                : "Read-only — you don't have permission to edit users."}
            </CardDescription>
          </div>
          {canEditUsers && (
            <Button size="sm" onClick={() => setAddUserOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" />Add user
            </Button>
          )}
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

      {/* Add role dialog */}
      <Dialog
        open={addRoleOpen}
        onClose={() => !busy && setAddRoleOpen(false)}
        title="Add role"
        description="Create a role, then grant it permissions in the matrix below."
      >
        <form onSubmit={onCreateRole} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Code <span className="text-destructive">*</span></Label>
            <Input name="code" required placeholder="warehouse_clerk" autoComplete="off" />
            <p className="text-xs text-muted-foreground">Lowercase letters, digits and underscores. Cannot be changed later.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Display name <span className="text-destructive">*</span></Label>
            <Input name="name" required placeholder="Warehouse Clerk" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input name="description" placeholder="Optional" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setAddRoleOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create role
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add user dialog */}
      <Dialog
        open={addUserOpen}
        onClose={() => !busy && setAddUserOpen(false)}
        title="Add user"
        description="Creates a login account. Share the temporary password with them; they can change it later."
      >
        <AddUserForm roles={roles} busy={busy} onSubmit={onCreateUser} onCancel={() => setAddUserOpen(false)} />
      </Dialog>

      {/* Delete role confirm */}
      <Dialog
        open={!!roleToDelete}
        onClose={() => !busy && setRoleToDelete(null)}
        title={`Delete role “${roleToDelete?.name}”?`}
        description="This removes the role and its permission grants. It can't be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRoleToDelete(null)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={onDeleteRole} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete role
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function AddUserForm({
  roles,
  busy,
  onSubmit,
  onCancel,
}: {
  roles: RoleLite[];
  busy: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState(() => generatePassword());

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Email <span className="text-destructive">*</span></Label>
        <Input name="email" type="email" required placeholder="person@company.com" autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label>Full name <span className="text-destructive">*</span></Label>
        <Input name="displayName" required placeholder="Jane Doe" />
      </div>
      <div className="space-y-1.5">
        <Label>Temporary password <span className="text-destructive">*</span></Label>
        <div className="flex gap-2">
          <Input
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="font-mono"
          />
          <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} aria-label="Generate password">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">At least 8 characters. Give this to the user to sign in with.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Starting role</Label>
          <select
            name="roleId"
            defaultValue=""
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">No role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Data scope</Label>
          <select
            name="scope"
            defaultValue="all"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create user
        </Button>
      </div>
    </form>
  );
}
