/** True when `email` appears in the comma-separated `allowlist` (case-insensitive). */
export function isAllowedEmail(email: string | null | undefined, allowlist: string): boolean {
  if (!email) return false;
  const wanted = email.trim().toLowerCase();
  return allowlist
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}
