"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/supabase-server";
import { createAdminClient } from "@/lib/db/supabase-admin";
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

// ---------------------------------------------------------------------------
// Create a new role
// ---------------------------------------------------------------------------
const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, digits and underscores; start with a letter"),
  name: z.string().trim().min(1, "Name required").max(60),
  description: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function createRole(input: unknown): Promise<Result & { id?: string }> {
  try {
    await requirePermission(P.admin.rolesEdit);
    const v = createRoleSchema.parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("role")
      .insert({ code: v.code, name: v.name, description: v.description || null, is_system: false })
      .select("id")
      .single();
    if (error) {
      return {
        ok: false,
        error: /duplicate|unique/i.test(error.message)
          ? `A role with code "${v.code}" already exists.`
          : error.message,
      };
    }
    revalidatePath("/settings/roles");
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: permErr(e, "add roles") };
  }
}

// ---------------------------------------------------------------------------
// Delete a role (only non-system roles that are not assigned to anyone)
// ---------------------------------------------------------------------------
export async function deleteRole(roleId: string): Promise<Result> {
  try {
    await requirePermission(P.admin.rolesEdit);
    const supabase = await createClient();

    const { data: role } = await supabase
      .from("role")
      .select("is_system, name")
      .eq("id", roleId)
      .maybeSingle();
    if (!role) return { ok: false, error: "Role not found." };
    if (role.is_system) return { ok: false, error: "Built-in system roles can't be deleted." };

    // Best-effort friendly pre-check. This can UNDER-count for a caller who has
    // admin.roles.edit but not admin.users.view (RLS hides other users'
    // user_role rows), so it is NOT the security boundary — the ON DELETE
    // RESTRICT foreign key (migration 0018) is what actually prevents deleting
    // an assigned role. We still surface a nicer message when we can see it.
    const { count, error: countErr } = await supabase
      .from("user_role")
      .select("*", { head: true, count: "exact" })
      .eq("role_id", roleId);
    if (countErr) return { ok: false, error: countErr.message };
    if (count && count > 0) {
      return { ok: false, error: `"${role.name}" is assigned to ${count} user(s). Remove it from them first.` };
    }

    const { error } = await supabase.from("role").delete().eq("id", roleId);
    if (error) {
      return {
        ok: false,
        error: /foreign key|violates|referenced|23503/i.test(error.message)
          ? `"${role.name}" is still assigned to one or more users. Remove it from them first.`
          : error.message,
      };
    }
    revalidatePath("/settings/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permErr(e, "delete roles") };
  }
}

// ---------------------------------------------------------------------------
// Create a new user (login account) and optionally assign a starting role
//
// Creating an auth account requires the service-role key, so this runs through
// the admin client (which BYPASSES RLS). The caller's permission is checked
// FIRST against their own session — so this cannot be used to escalate.
// ---------------------------------------------------------------------------
const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  displayName: z.string().trim().min(1, "Name required").max(80),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  roleId: z.string().uuid().optional().or(z.literal("")),
  scope: z.enum(["all", "team", "branch", "own"]).default("all"),
});

export async function createUser(input: unknown): Promise<Result & { userId?: string }> {
  try {
    await requirePermission(P.admin.usersEdit);
    const v = createUserSchema.parse(input);

    let admin;
    try {
      admin = createAdminClient();
    } catch {
      return {
        ok: false,
        error:
          "Adding users isn't configured on the server. Set SUPABASE_SERVICE_ROLE_KEY in your environment (Vercel → Settings → Environment Variables) and redeploy.",
      };
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: v.email,
      password: v.password,
      email_confirm: true,
      user_metadata: { full_name: v.displayName },
    });
    if (error || !data.user) {
      const msg = error?.message ?? "Could not create the account.";
      return {
        ok: false,
        error: /already|exist|registered/i.test(msg) ? "A user with that email already exists." : msg,
      };
    }

    const userId = data.user.id;

    // The on_auth_user_created trigger inserts the app_user row; upsert here so
    // the display name is set reliably regardless of trigger timing.
    const { error: profileErr } = await admin
      .from("app_user")
      .upsert(
        { id: userId, email: v.email, display_name: v.displayName, is_active: true },
        { onConflict: "id" }
      );
    if (profileErr) return { ok: false, error: `Account created, but profile setup failed: ${profileErr.message}` };

    if (v.roleId) {
      const { error: roleErr } = await admin
        .from("user_role")
        .upsert({ user_id: userId, role_id: v.roleId, scope: v.scope }, { onConflict: "user_id,role_id" });
      if (roleErr) return { ok: false, error: `Account created, but role assignment failed: ${roleErr.message}` };
    }

    revalidatePath("/settings/roles");
    return { ok: true, userId };
  } catch (e) {
    return { ok: false, error: permErr(e, "add users") };
  }
}

function permErr(e: unknown, action: string): string {
  if ((e as { code?: string })?.code === "PERMISSION_DENIED") {
    return `You don't have permission to ${action}.`;
  }
  if (e instanceof z.ZodError) return e.issues[0].message;
  return (e as Error)?.message ?? "Something went wrong";
}
