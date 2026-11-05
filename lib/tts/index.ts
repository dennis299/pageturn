import type { ProviderId } from "@/lib/db/types";
import { elevenlabs } from "./elevenlabs";
import { gemini } from "./gemini";
import { openrouter } from "./openrouter";
import type { TtsProvider } from "./types";

const PROVIDERS: Record<ProviderId, TtsProvider> = { elevenlabs, gemini, openrouter };

export function getProvider(id: ProviderId): TtsProvider {
  return PROVIDERS[id];
}
