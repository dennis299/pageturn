import type { ProviderId } from "@/lib/db/types";
import { HttpError } from "@/lib/http";

export type RouteVoice = { provider: ProviderId; model: string; voiceId: string; voiceName: string; paid: boolean };

const ROUTABLE = /rate.?limit|too many requests|quota|credits?|depleted|exhausted|limit (reached|exceeded)|per.?day|resource has been exhausted/i;

/** A failure another voice could get around: rate limits, daily caps, quotas or missing credit. */
export function isRoutableError(e: unknown): boolean {
  if (e instanceof HttpError && (e.status === 429 || e.status === 402)) return true;
  return ROUTABLE.test(e instanceof Error ? e.message : String(e));
}

/** The voices tried, in order, when the book's voice can't be used. ElevenLabs is never chosen automatically. */
export function routeVoices(): RouteVoice[] {
  return [
    { provider: "openrouter", model: "heygen/heygen-voice-1-turbo:free", voiceId: "nadine", voiceName: "Nadine", paid: false },
    { provider: "gemini", model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts", voiceId: "Sulafat", voiceName: "Sulafat (Gemini)", paid: false },
    { provider: "openrouter", model: "hexgrad/kokoro-82m", voiceId: "af_heart", voiceName: "Heart (Kokoro)", paid: true },
  ];
}

/** Voices to try after `current` fails: free first, then cheap (only when paid is allowed), never the same provider/model. */
export function fallbackChain(current: { provider: ProviderId; model?: string | null }, opts: { allowPaid: boolean }): RouteVoice[] {
  return routeVoices().filter((v) => {
    if (!opts.allowPaid && v.paid) return false;
    if (current.provider === "gemini" && v.provider === "gemini") return false;
    return !(v.provider === current.provider && v.model === current.model);
  });
}
