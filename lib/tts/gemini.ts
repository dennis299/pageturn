import { HttpError } from "@/lib/http";
import { base64ToBytes, mp3DurationSec, pcmToMp3 } from "@/lib/audio/mp3";
import type { TtsProvider, Voice } from "./types";

// Flash-Lite first: its free-tier limits are known (3 requests/min, 10/day on the free AI Studio key).
export const GEMINI_TTS_MODELS = [
  { id: "gemini-3.8-flash-lite-tts", name: "3.8 Flash-Lite TTS · free key" },
  { id: "gemini-3.8-flash-tts", name: "3.8 Flash TTS" },
] as const;

const VOICES: [string, string][] = [
  ["Sulafat", "Warm"], ["Gacrux", "Mature"], ["Charon", "Informative"], ["Kore", "Firm"], ["Schedar", "Even"],
  ["Achernar", "Soft"], ["Vindemiatrix", "Gentle"], ["Iapetus", "Clear"], ["Algieba", "Smooth"], ["Despina", "Smooth"],
  ["Rasalgethi", "Informative"], ["Sadaltager", "Knowledgeable"], ["Orus", "Firm"], ["Alnilam", "Firm"], ["Erinome", "Clear"],
  ["Umbriel", "Easy-going"], ["Callirrhoe", "Easy-going"], ["Zubenelgenubi", "Casual"], ["Achird", "Friendly"], ["Aoede", "Breezy"],
  ["Enceladus", "Breathy"], ["Algenib", "Gravelly"], ["Pulcherrima", "Forward"], ["Zephyr", "Bright"], ["Autonoe", "Bright"],
  ["Puck", "Upbeat"], ["Laomedeia", "Upbeat"], ["Leda", "Youthful"], ["Fenrir", "Excitable"], ["Sadachbia", "Lively"],
];

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new HttpError(500, "GEMINI_API_KEY is not set.");
  return k;
}

export const gemini: TtsProvider = {
  id: "gemini",

  async listVoices() {
    return VOICES.map(([name, tone]): Voice => ({ id: name, name, description: tone, provider: "gemini", free: false }));
  },

  async synthesize({ text, voiceId, model }) {
    const m = model || process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
      body: JSON.stringify({
        // The book text only. Gemini 3.8 TTS treats this field as a word-for-word transcript, so any
        // instruction placed here ("read this in a warm voice…") is spoken aloud. The tone comes from
        // the voice you pick (Sulafat is the warm one).
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } } },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let msg = body;
      try {
        msg = JSON.parse(body).error?.message ?? body;
      } catch {}
      throw new HttpError(res.status === 429 || res.status === 402 ? res.status : 502, `Gemini ${res.status}: ${String(msg).slice(0, 160)}`);
    }
    const j = await res.json();
    const part = j.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData)?.inlineData as
      | { mimeType: string; data: string }
      | undefined;
    if (!part) throw new HttpError(502, "Gemini returned no audio.");
    const rate = Number(part.mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
    const raw = base64ToBytes(part.data);
    const pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
    const audio = pcmToMp3(pcm, rate);
    return { audio, durationSec: mp3DurationSec(audio) || pcm.length / rate };
  },
};
