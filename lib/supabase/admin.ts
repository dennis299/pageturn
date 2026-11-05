import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import { HttpError } from "@/lib/http";

/** Server-only client with the Supabase secret key (bypasses RLS). Used for the owner's guest admin and the cron. */
export function createAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new HttpError(501, "Add SUPABASE_SECRET_KEY to the app's environment to manage guests.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const isGuest = (u: User) => (u.app_metadata as { pageturn?: { role?: string } })?.pageturn?.role === "guest";

/** Every auth user, page by page (the shared project has few users). */
export async function allUsers(admin: SupabaseClient): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}
