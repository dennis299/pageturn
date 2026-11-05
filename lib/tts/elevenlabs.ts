import { HttpError } from "@/lib/http";
import { base64ToBytes, mp3DurationSec } from "@/lib/audio/mp3";
import type { TtsProvider, Voice } from "./types";

const API = "https://api.elevenlabs.io/v1";
export const ELEVEN_MODELS = [
  { id: "eleven_flash_v2_5", name: "Flash v2.5 · half price" },
  { id: "eleven_multilingual_v2", name: "Multilingual v2 · richest" },
] as const;
export const DEFAULT_ELEVEN_MODEL = "eleven_flash_v2_5";

/** Built-in voices that work even when the key can't list voices. */
const LIBRARY: Voice[] = [
  {
    id: "MFZUKuGQUsGJPQjTS4wC",
    name: "Jon",
    description: "Warm, grounded storyteller (the Built & Broken narrator)",
    provider: "elevenlabs",
    free: false,
  },
];

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new HttpError(500, "ELEVENLABS_API_KEY is not set.");
  return k;
}

async function fail(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = j.detail?.message ?? j.detail?.status ?? j.detail ?? body;
  } catch {}
  if (res.status === 401 || /quota|credits/i.test(String(msg))) {
    throw new HttpError(402, `ElevenLabs: ${String(msg).slice(0, 160) || "not enough credits"}`);
  }
  throw new HttpError(502, `ElevenLabs ${res.status}: ${String(msg).slice(0, 160)}`);
}

export const elevenlabs: TtsProvider = {
  id: "elevenlabs",

  async listVoices() {
    const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": key() } });
    if (!res.ok) return LIBRARY;
    const j = (await res.json()) as { voices: { voice_id: string; name: string; description?: string; labels?: Record<string, string> }[] };
    const mine: Voice[] = j.voices.map((v) => ({
      id: v.voice_id,
      name: v.name.split(" - ")[0],
      description: v.name.includes(" - ") ? v.name.split(" - ").slice(1).join(" - ") : v.labels?.description,
      provider: "elevenlabs",
      free: false,
    }));
    return [...LIBRARY.filter((l) => !mine.some((m) => m.id === l.id)), ...mine];
  },

  async synthesize({ text, voiceId, model }) {
    const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key(), "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: model || DEFAULT_ELEVEN_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
      }),
    });
    if (!res.ok) await fail(res);
    const j = (await res.json()) as {
      audio_base64: string;
      alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
    };
    const audio = base64ToBytes(j.audio_base64);
    const a = j.alignment;
    return {
      audio,
      durationSec: mp3DurationSec(audio) || a?.character_end_times_seconds.at(-1) || 0,
      alignment: a ? { chars: a.characters, start: a.character_start_times_seconds, end: a.character_end_times_seconds } : undefined,
    };
  },
};

/** Credits used and left this month. */
export async function elevenCredits(): Promise<{ used: number; limit: number; remaining: number; resetsAt: string | null; tier: string }> {
  const res = await fetch(`${API}/user/subscription`, { headers: { "xi-api-key": key() } });
  if (!res.ok) await fail(res);
  const j = await res.json();
  return {
    used: j.character_count,
    limit: j.character_limit,
    remaining: Math.max(0, j.character_limit - j.character_count),
    resetsAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
    tier: j.tier,
  };
}
