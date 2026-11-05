export type AppUser = { id: string; email: string | null };

/** The signed-in user from verified JWT claims, or null (anonymous sessions don't count). */
export function userFromClaims(claims: Record<string, unknown> | null | undefined): AppUser | null {
  if (!claims || typeof claims.sub !== "string" || !claims.sub || claims.is_anonymous === true) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
