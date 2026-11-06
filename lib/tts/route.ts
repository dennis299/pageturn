import type { ProviderId } from "@/lib/db/types";
import { HttpError } from "@/lib/http";

export type RouteVoice = { provider: ProviderId; model: string; voiceId: string; voiceName: string; paid: boolean };
export type RouteKey = "openrouter_free" | "gemini" | "kokoro" | "elevenlabs";

/** The order used when you haven't set your own: free first, then cheap. ElevenLabs only if you add it. */
export const DEFAULT_ROUTE_ORDER: RouteKey[] = ["openrouter_free", "gemini", "kokoro"];
export const ROUTE_KEYS: RouteKey[] = ["openrouter_free", "gemini", "kokoro", "elevenlabs"];

const ROUTABLE = /rate.?limit|too many requests|quota|credits?|depleted|exhausted|limit (reached|exceeded)|per.?day|resource has been exhausted/i;

/** A failure another voice could get around: rate limits, daily caps, quotas or missing credit. */
export function isRoutableError(e: unknown): boolean {
  if (e instanceof HttpError && (e.status === 429 || e.status === 402)) return true;
  return ROUTABLE.test(e instanceof Error ? e.message : String(e));
}

type ElevenVoice = { voiceId: string; voiceName: string; model?: string | null };
const JON: ElevenVoice = { voiceId: "MFZUKuGQUsGJPQjTS4wC", voiceName: "Jon", model: "eleven_flash_v2_5" };

/** The voice each route step uses. */
export function routeVoices(elevenVoice: ElevenVoice = JON): Record<RouteKey, RouteVoice> {
  return {
    openrouter_free: { provider: "openrouter", model: "heygen/heygen-voice-1-turbo:free", voiceId: "nadine", voiceName: "Nadine", paid: false },
    gemini: { provider: "gemini", model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts", voiceId: "Sulafat", voiceName: "Sulafat (Gemini)", paid: false },
    kokoro: { provider: "openrouter", model: "hexgrad/kokoro-82m", voiceId: "af_heart", voiceName: "Heart (Kokoro)", paid: true },
    elevenlabs: {
      provider: "elevenlabs",
      model: elevenVoice.model || "eleven_flash_v2_5",
      voiceId: elevenVoice.voiceId,
      voiceName: elevenVoice.voiceName,
      paid: true,
    },
  };
}

/**
 * Voices to try after `current` fails, in your order (default: free → Gemini → Kokoro). Paid steps are
 * dropped when paid isn't allowed (guests), and the provider/model that just failed is skipped.
 */
export function fallbackChain(
  current: { provider: ProviderId; model?: string | null },
  opts: { allowPaid: boolean; order?: RouteKey[] | null; elevenVoice?: ElevenVoice },
): RouteVoice[] {
  const all = routeVoices(opts.elevenVoice);
  const order = (opts.order?.length ? opts.order : DEFAULT_ROUTE_ORDER).filter((k, i, a) => ROUTE_KEYS.includes(k) && a.indexOf(k) === i);
  return order
    .map((k) => all[k])
    .filter((v) => {
      if (!opts.allowPaid && v.paid) return false;
      if (current.provider === v.provider && (v.provider === "gemini" || v.provider === "elevenlabs")) return false;
      return !(v.provider === current.provider && v.model === current.model);
    });
}
