import { isAllowedEmail } from "./allowlist";

export type Role = "owner" | "guest";
export type AppUser = { id: string; email: string | null; role: Role };

type Claims = Record<string, unknown> | null | undefined;

/** The signed-in user from verified JWT claims, or null (anonymous sessions don't count). */
export function userFromClaims(claims: Claims): { id: string; email: string | null } | null {
  if (!claims || typeof claims.sub !== "string" || !claims.sub || claims.is_anonymous === true) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

/**
 * What a signed-in user may do: owners are the emails in ALLOWED_EMAILS; guests are accounts the
 * owner created, marked in `app_metadata.pageturn.role` (only the server can write app_metadata,
 * unlike user_metadata). Anyone else gets null and is kept out.
 */
export function accessRole(claims: Claims, allowlist: string): Role | null {
  const user = userFromClaims(claims);
  if (!user) return null;
  if (isAllowedEmail(user.email, allowlist)) return "owner";
  const app = claims?.app_metadata as { pageturn?: { role?: unknown } } | undefined;
  return app?.pageturn?.role === "guest" ? "guest" : null;
}
