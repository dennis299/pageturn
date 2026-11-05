import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isAllowedEmail } from "@/lib/auth/allowlist";
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

/** The signed-in, allowlisted user, or HttpError 401/403. */
export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new HttpError(401, "Please log in.");
  if (!isAllowedEmail(data.user.email, ALLOWED_EMAILS)) throw new HttpError(403, "This app is private.");
  return { supabase, user: data.user };
}
