import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderId } from "@/lib/db/types";
import { HttpError } from "@/lib/http";

/** Requests allowed per minute / per day for a provider, from env (0 or unset = no app-side limit). */
export function providerLimits(provider: ProviderId): { rpm: number; rpd: number } {
  if (provider !== "gemini") return { rpm: 0, rpd: 0 };
  return { rpm: Number(process.env.GEMINI_TTS_RPM) || 0, rpd: Number(process.env.GEMINI_TTS_RPD) || 0 };
}

/** Whether usage is over a limit (0 = unlimited). */
export function overLimit(used: number, limit: number): boolean {
  return limit > 0 && used >= limit;
}

/**
 * Stops before calling a provider whose own rate limit is used up (the free Gemini key is shared by
 * every account), by counting audio parts made with it in the last minute and today across all users.
 * Throws a 429, which the voice router treats as "try the next voice".
 */
export async function checkProviderBudget(supabase: SupabaseClient, provider: ProviderId): Promise<void> {
  const { rpm, rpd } = providerLimits(provider);
  if (!rpm && !rpd) return;
  const now = Date.now();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0); // Gemini's daily quota resets at midnight Pacific; UTC is a safe approximation.
  const count = async (since: Date) => {
    const { data, error } = await supabase.rpc("ab_provider_usage", { p_provider: provider, p_since: since.toISOString() });
    if (error) return 0;
    return Number(data) || 0;
  };
  if (rpm && overLimit(await count(new Date(now - 60_000)), rpm)) {
    throw new HttpError(429, `Gemini's free limit of ${rpm} requests a minute is used up.`);
  }
  if (rpd && overLimit(await count(startOfDay), rpd)) {
    throw new HttpError(429, `Gemini's free limit of ${rpd} requests a day is used up.`);
  }
}
