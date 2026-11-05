import type { ProviderId } from "@/lib/db/types";

export type Cost = { unit: "credits" | "usd" | "free"; amount: number; label: string };

/** Speech runs at about 15 characters a second; Gemini bills 25 audio tokens per second. */
const AUDIO_TOKENS_PER_CHAR = 25 / 15;
const TEXT_TOKENS_PER_CHAR = 1 / 4;

/** Gemini TTS prices in USD per million tokens (input text / output audio), checked 2026-11-05. */
const GEMINI_RATES: Record<string, { in: number; out: number }> = {
  "gemini-3.8-flash-tts": { in: 0.5, out: 9 },
  "gemini-3.8-flash-lite-tts": { in: 0.5, out: 6 },
  "gemini-3.1-flash-tts-preview": { in: 1, out: 20 },
  "gemini-2.5-flash-preview-tts": { in: 0.5, out: 10 },
  "gemini-2.5-pro-preview-tts": { in: 1, out: 20 },
};

export const ELEVEN_HALF_PRICE = /flash|turbo/;

const usd = (amount: number): Cost => ({
  unit: "usd",
  amount,
  label: amount < 0.01 ? "< $0.01" : `≈ $${amount.toFixed(2)}`,
});

/** Rough cost of reading `chars` characters aloud with a provider/model. */
export function estimateCost(
  chars: number,
  provider: ProviderId,
  model?: string,
  orPricing?: { prompt: number; completion: number },
): Cost {
  if (provider === "elevenlabs") {
    const amount = Math.round(chars * (ELEVEN_HALF_PRICE.test(model ?? "eleven_flash_v2_5") ? 0.5 : 1));
    return { unit: "credits", amount, label: `≈ ${amount.toLocaleString("en-US")} credits` };
  }
  if (provider === "gemini") {
    const r = GEMINI_RATES[model ?? ""] ?? GEMINI_RATES["gemini-3.1-flash-tts-preview"];
    return usd((chars * TEXT_TOKENS_PER_CHAR * r.in + chars * AUDIO_TOKENS_PER_CHAR * r.out) / 1e6);
  }
  const p = orPricing ?? { prompt: 0, completion: 0 };
  if (!p.prompt && !p.completion) return { unit: "free", amount: 0, label: "Free" };
  return usd(chars * p.prompt + chars * AUDIO_TOKENS_PER_CHAR * p.completion);
}

/** True when a provider/model costs money (ElevenLabs credits count as money). */
export function isPaid(provider: ProviderId, orPricing?: { prompt: number; completion: number }): boolean {
  if (provider !== "openrouter") return true;
  return Boolean(orPricing && (orPricing.prompt || orPricing.completion));
}
