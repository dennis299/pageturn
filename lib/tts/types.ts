import type { ProviderId } from "@/lib/db/types";

export type { ProviderId };

export type Alignment = { chars: string[]; start: number[]; end: number[] };

export type Voice = {
  id: string;
  name: string;
  provider: ProviderId;
  /** Model the voice belongs to (OpenRouter) or the default model to use with it. */
  model?: string;
  modelName?: string;
  description?: string;
  free: boolean;
  /** OpenRouter prices: USD per input character / per output audio token. */
  pricing?: { prompt: number; completion: number };
};

export type TtsResult = { audio: Uint8Array; durationSec: number; alignment?: Alignment };

export interface TtsProvider {
  id: ProviderId;
  listVoices(): Promise<Voice[]>;
  synthesize(r: { text: string; voiceId: string; model?: string }): Promise<TtsResult>;
}
