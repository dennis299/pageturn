import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderId } from "@/lib/db/types";
import { ROUTE_KEYS, type RouteKey } from "@/lib/tts/route";

export type DefaultVoice = { provider: ProviderId; voiceId: string; voiceName: string; model?: string };
export type VoicePrefs = { defaultVoice: DefaultVoice | null; routeOrder: RouteKey[] | null; askBeforePaid: boolean };

export const DEFAULT_PREFS: VoicePrefs = { defaultVoice: null, routeOrder: null, askBeforePaid: true };

/** Your voice preferences (default voice, auto-route order, ask before paid chapters). Works on server and client. */
export async function loadVoicePrefs(supabase: SupabaseClient, userId: string): Promise<VoicePrefs> {
  const { data } = await supabase
    .from("ab_settings")
    .select("default_voice,route_order,ask_before_paid")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return DEFAULT_PREFS;
  return {
    defaultVoice: (data.default_voice as DefaultVoice | null) ?? null,
    routeOrder: ((data.route_order as string[] | null) ?? null)?.filter((k): k is RouteKey => ROUTE_KEYS.includes(k as RouteKey)) ?? null,
    askBeforePaid: data.ask_before_paid ?? true,
  };
}

/** The ElevenLabs voice to use when auto-routing reaches ElevenLabs: your default if it's an ElevenLabs voice. */
export function elevenVoiceFrom(prefs: VoicePrefs) {
  const d = prefs.defaultVoice;
  return d && d.provider === "elevenlabs" ? { voiceId: d.voiceId, voiceName: d.voiceName, model: d.model } : undefined;
}
