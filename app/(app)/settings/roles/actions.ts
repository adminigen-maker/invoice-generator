"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/supabase-server";
import { requirePermission } from "@/lib/rbac/can";
import { P } from "@/lib/rbac/permissions";

type Result = { ok: boolean; error?: string };

/** Grant or revoke a single permission for a role. */
export async function toggleRolePermission(
  roleId: string,
  permissionId: string,
  grant: boolean
): Promise<Result> {
  try {
    await requirePermission(P.admin.rolesEdit);
    const supabase = await createClient();
    if (grant) {
      const { error } = await supabase
        .from("role_permission")
        .upsert({ role_id: roleId, permission_id: permissionId }, { onConflict: "role_id,permission_id" });
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("role_permission")
        .delete()
        .eq("role_id", roleId)
        .eq("permission_id", permissionId);
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/settings/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permErr(e, "edit roles") };
  }
}

/** Assign or remove a role for a user (assigned roles use the user's scope). */
export async function toggleUserRole(
  userId: string,
  roleId: string,
  assign: boolean,
  scope: string
): Promise<Result> {
  try {
    await requirePermission(P.admin.usersEdit);
    const supabase = await createClient();
    if (assign) {
      const { error } = await supabase
        .from("user_role")
        .upsert({ user_id: userId, role_id: roleId, scope }, { onConflict: "user_id,role_id" });
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("user_role")
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId);
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/settings/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permErr(e, "edit users") };
  }
}

/** Set the data scope applied to all of a user's role assignments. */
export async function setUserScope(userId: string, scope: string): Promise<Result> {
  try {
    await requirePermission(P.admin.usersEdit);
    const supabase = await createClient();
    const { error } = await supabase.from("user_role").update({ scope }).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permErr(e, "edit users") };
  }
}

function permErr(e: unknown, action: string): string {
  if ((e as { code?: string })?.code === "PERMISSION_DENIED") {
    return `You don't have permission to ${action}.`;
  }
  return (e as Error)?.message ?? "Something went wrong";
}
