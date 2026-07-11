import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase-server";

/**
 * Request-scoped, deduped current user.
 *
 * supabase.auth.getUser() is a NETWORK call to GoTrue (it validates the JWT
 * server-side), not a local cookie read. Wrapping it in React's cache() means
 * that within a single server render the validation happens once, no matter how
 * many components ask for the user.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});
