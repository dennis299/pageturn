import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderId } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import type { AppUser } from "./claims";

export type Limits = { freeVoicesOnly: boolean; monthlyAudioMinutes: number | null; maxBooks: number | null };

/** Owners (ALLOWED_EMAILS) have no limits. */
export const OWNER_LIMITS: Limits = { freeVoicesOnly: false, monthlyAudioMinutes: null, maxBooks: null };
/** A guest with no limits row yet gets these. */
export const GUEST_DEFAULTS: Limits = { freeVoicesOnly: true, monthlyAudioMinutes: 120, maxBooks: 3 };

/** Free OpenRouter models (":free") and Gemini on the owner's free key cost nothing. */
export function isFreeVoice(provider: ProviderId, model?: string | null): boolean {
  if (provider === "gemini") return true;
  return provider === "openrouter" && Boolean(model?.endsWith(":free"));
}

export async function getLimits(supabase: SupabaseClient, user: AppUser): Promise<Limits> {
  if (user.role === "owner") return OWNER_LIMITS;
  const { data } = await supabase
    .from("ab_user_limits")
    .select("free_voices_only,monthly_audio_minutes,max_books")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return GUEST_DEFAULTS;
  return { freeVoicesOnly: data.free_voices_only, monthlyAudioMinutes: data.monthly_audio_minutes, maxBooks: data.max_books };
}

/** Minutes of new audio this account generated since the 1st of this month (UTC). */
export async function monthlyMinutesUsed(supabase: SupabaseClient, userId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("ab_chunks")
    .select("duration_sec")
    .eq("user_id", userId)
    .eq("status", "ready")
    .gte("updated_at", start.toISOString())
    .range(0, 9999);
  return (data ?? []).reduce((s, r) => s + (r.duration_sec ?? 0), 0) / 60;
}

/** Throws 403 when a guest may not add this book. */
export function checkCreateBook(limits: Limits, booksCount: number, voice: { provider: ProviderId; model?: string | null }) {
  if (limits.maxBooks !== null && booksCount >= limits.maxBooks) {
    throw new HttpError(403, `Your account can hold ${limits.maxBooks} books. Delete one to add another.`);
  }
  if (limits.freeVoicesOnly && !isFreeVoice(voice.provider, voice.model)) {
    throw new HttpError(403, "Your account can use the free voices only.");
  }
}

/** Throws 403 (not something another voice can fix) when a guest has used this month's audio. */
export function checkGenerate(limits: Limits, minutesUsed: number) {
  if (limits.monthlyAudioMinutes !== null && minutesUsed >= limits.monthlyAudioMinutes) {
    throw new HttpError(403, `You've used your ${limits.monthlyAudioMinutes} minutes of new audio for this month. It resets on the 1st.`);
  }
}
