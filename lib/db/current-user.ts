import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase-server";
import { isDemoMode } from "@/lib/demo-mode";

const DEMO_MODE = isDemoMode();

/**
 * Request-scoped, deduped current user.
 *
 * supabase.auth.getUser() is a NETWORK call to GoTrue (it validates the JWT
 * server-side), not a local cookie read. Wrapping it in React's cache() means
 * that within a single server render the validation happens once, no matter how
 * many components ask for the user.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  // The literal NODE_ENV test lets a production build delete this block, and the fake user inside it.
  if (process.env.NODE_ENV !== "production" && DEMO_MODE) {
    return {
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@demo.local",
      app_metadata: {},
      user_metadata: { display_name: "Demo Admin" },
      aud: "authenticated",
      created_at: new Date(0).toISOString(),
    } as unknown as User;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});
