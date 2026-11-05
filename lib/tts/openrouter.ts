import { HttpError } from "@/lib/http";
import { mp3DurationSec, pcmToMp3, wavToPcm } from "@/lib/audio/mp3";
import type { TtsProvider, Voice } from "./types";

type OrModel = {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  supported_voices: string[] | null;
};

/** Speech models we never list (other providers reached directly, or no voice list). */
const SKIP = /^(elevenlabs|google)\//;

let cache: { at: number; models: OrModel[] } | undefined;
/** Models that only return raw PCM (learned from their first error). */
const PCM_ONLY = new Set<string>();

/** Text-to-speech models on OpenRouter, cached for 10 minutes. */
export async function speechModels(): Promise<OrModel[]> {
  if (cache && Date.now() - cache.at < 600_000) return cache.models;
  const res = await fetch("https://openrouter.ai/api/v1/models?output_modalities=speech");
  if (!res.ok) throw new HttpError(502, `OpenRouter model list failed (${res.status}).`);
  const j = (await res.json()) as { data: OrModel[] };
  cache = { at: Date.now(), models: j.data.filter((m) => !SKIP.test(m.id) && m.supported_voices?.length) };
  return cache.models;
}

export async function orPricing(model: string): Promise<{ prompt: number; completion: number } | undefined> {
  const m = (await speechModels()).find((x) => x.id === model);
  return m ? { prompt: Number(m.pricing.prompt) || 0, completion: Number(m.pricing.completion) || 0 } : undefined;
}

function prettyVoice(v: string): string {
  const base = v.replace(/^(aura-2-|flux-|aai-)/, "").replace(/-en$/, "").replace(/:.*$/, "");
  const kokoro = base.match(/^([ab])([fm])_(.+)$/);
  if (kokoro) return `${kokoro[3][0].toUpperCase()}${kokoro[3].slice(1)} (${kokoro[1] === "a" ? "US" : "UK"})`;
  return base.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const openrouter: TtsProvider = {
  id: "openrouter",

  async listVoices() {
    const models = await speechModels();
    return models.flatMap((m) => {
      const pricing = { prompt: Number(m.pricing.prompt) || 0, completion: Number(m.pricing.completion) || 0 };
      const free = !pricing.prompt && !pricing.completion;
      return (m.supported_voices ?? []).map(
        (v): Voice => ({
          id: v,
          name: prettyVoice(v),
          provider: "openrouter",
          model: m.id,
          modelName: m.name.replace(/\s*\(free\)\s*$/i, ""),
          free,
          pricing,
        }),
      );
    });
  },

  async synthesize({ text, voiceId, model }) {
    const k = process.env.OPENROUTER_API_KEY;
    if (!k) throw new HttpError(500, "OPENROUTER_API_KEY is not set. Create a free key at openrouter.ai/keys.");
    if (!model) throw new HttpError(400, "An OpenRouter voice needs a model.");
    const request = (format: "mp3" | "pcm") =>
      fetch("https://openrouter.ai/api/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json", "X-Title": "Pageturn" },
        body: JSON.stringify({ model, input: text, voice: voiceId, response_format: format }),
      });
    const errorOf = async (r: Response) => {
      const body = await r.text().catch(() => "");
      try {
        return String(JSON.parse(body).error?.message ?? body);
      } catch {
        return body;
      }
    };

    let res = await request(PCM_ONLY.has(model) ? "pcm" : "mp3");
    if (!res.ok) {
      let msg = await errorOf(res);
      // Some models (HeyGen) only return raw PCM: ask again in that format and remember it.
      if (res.status === 400 && /response_format.*pcm/i.test(msg)) {
        PCM_ONLY.add(model);
        res = await request("pcm");
        msg = res.ok ? "" : await errorOf(res);
      }
      if (!res.ok) throw new HttpError(res.status === 429 ? 429 : res.status === 402 ? 402 : 502, `OpenRouter ${res.status}: ${msg.slice(0, 160)}`);
    }
    const type = res.headers.get("content-type") ?? "";
    let audio = new Uint8Array(await res.arrayBuffer());
    if (/pcm|L16/i.test(type)) {
      const rate = Number(type.match(/rate=(\d+)/)?.[1] ?? 24000);
      const channels = Number(type.match(/channels=(\d+)/)?.[1] ?? 1);
      const all = new Int16Array(audio.buffer, audio.byteOffset, Math.floor(audio.byteLength / 2));
      const mono = channels > 1 ? all.filter((_, i) => i % channels === 0) : all;
      audio = pcmToMp3(mono, rate) as Uint8Array<ArrayBuffer>;
    } else if (/wav/.test(type) || (audio[0] === 0x52 && audio[1] === 0x49 && audio[2] === 0x46)) {
      const { pcm, sampleRate } = wavToPcm(audio);
      audio = pcmToMp3(pcm, sampleRate) as Uint8Array<ArrayBuffer>;
    }
    const durationSec = mp3DurationSec(audio);
    if (!durationSec) throw new HttpError(502, `OpenRouter returned audio we can't play (${type || "unknown type"}).`);
    return { audio, durationSec };
  },
};
