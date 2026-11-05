import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { accessRole, userFromClaims, type AppUser } from "@/lib/auth/claims";
import { ALLOWED_EMAILS, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";
import { HttpError } from "@/lib/http";

/** Cookie-bound Supabase client for server components, actions and route handlers. */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a server component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * The signed-in, allowlisted user, or HttpError 401/403. The login token is verified locally with
 * the project's public signing key (no call to Supabase), and the result is shared by every
 * component in the same request.
 */
export const requireUser = cache(async (): Promise<{ supabase: SupabaseClient; user: AppUser }> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const base = userFromClaims(data?.claims);
  if (!base) throw new HttpError(401, "Please log in.");
  const role = accessRole(data?.claims, ALLOWED_EMAILS);
  if (!role) throw new HttpError(403, "This app is private.");
  return { supabase, user: { ...base, role } };
});
