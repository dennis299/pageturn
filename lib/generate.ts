import type { SupabaseClient } from "@supabase/supabase-js";
import { isFreeVoice } from "@/lib/auth/limits";
import { BUCKET } from "@/lib/env";
import type { ChunkRow, ProviderId } from "@/lib/db/types";
import { getProvider as defaultGetProvider } from "@/lib/tts";
import { checkProviderBudget } from "@/lib/tts/budget";
import { fallbackChain, isRoutableError, type RouteKey } from "@/lib/tts/route";
import { sentenceTimings } from "@/lib/tts/timings";
import type { TtsProvider, TtsResult } from "@/lib/tts/types";

type Deps = {
  getProvider: (id: ProviderId) => Pick<TtsProvider, "synthesize">;
  /** May the router fall back to a paid voice (Kokoro)? False for guests. */
  allowPaid?: boolean;
  /** Throws a routable error when a provider's own rate limit (e.g. the free Gemini key) is used up. */
  checkBudget?: (supabase: SupabaseClient, provider: ProviderId) => Promise<void>;
  /** Your auto-route order (Settings → Voices); default is free → Gemini → Kokoro. */
  order?: RouteKey[] | null;
  /** The ElevenLabs voice to use if your order includes ElevenLabs. */
  elevenVoice?: { voiceId: string; voiceName: string; model?: string | null };
};

type Voice = { provider: ProviderId; voiceId: string; voiceName?: string; model?: string };

/** Short, human error text for the player. */
function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 240 ? msg.slice(0, 237) + "…" : msg;
}

/**
 * Generates one chunk's audio exactly once: claims it atomically, synthesizes it with the book's
 * voice, uploads `{uid}/{bookId}/{idx}.mp3` and marks it ready.
 *
 * If the voice hits a rate limit, a daily cap or runs out of credit, it routes to the next voice
 * (free first, then cheap when allowed, never ElevenLabs) and switches the rest of the book to that
 * voice, so the listener doesn't hear voices flip back and forth. Any other failure marks the chunk
 * `failed` without retrying, so a broken provider can't keep charging.
 */
export async function generateChunk(
  supabase: SupabaseClient,
  chunkId: string,
  deps: Deps = { getProvider: defaultGetProvider },
): Promise<{ claimed: boolean; chunk: ChunkRow; switchedTo?: string }> {
  const allowPaid = deps.allowPaid ?? true;
  const checkBudget = deps.checkBudget ?? checkProviderBudget;

  const { data: claimedRows, error: claimErr } = await supabase.rpc("ab_claim_chunk", { p_chunk: chunkId });
  if (claimErr) throw claimErr;
  const claimed = (claimedRows as ChunkRow[] | null)?.[0];
  if (!claimed) {
    const { data, error } = await supabase.from("ab_chunks").select("*").eq("id", chunkId).single();
    if (error) throw error;
    return { claimed: false, chunk: data as ChunkRow };
  }

  try {
    const { data: book, error: bookErr } = await supabase
      .from("ab_books")
      .select("voice_provider,voice_id,voice_name,voice_model")
      .eq("id", claimed.book_id)
      .single();
    if (bookErr) throw bookErr;

    const original: Voice = {
      provider: book.voice_provider as ProviderId,
      voiceId: book.voice_id,
      voiceName: book.voice_name,
      model: book.voice_model ?? undefined,
    };
    // Guests (allowPaid = false) never use a paid voice, even if their book was switched to one.
    const candidates: Voice[] = [original, ...fallbackChain({ provider: original.provider, model: original.model }, { allowPaid, order: deps.order, elevenVoice: deps.elevenVoice })].filter(
      (v) => allowPaid || isFreeVoice(v.provider, v.model),
    );

    let result: TtsResult | undefined;
    let used: Voice = original;
    let lastError: unknown;
    for (const v of candidates) {
      try {
        await checkBudget(supabase, v.provider);
        result = await deps.getProvider(v.provider).synthesize({ text: claimed.text, voiceId: v.voiceId, model: v.model });
        used = v;
        break;
      } catch (e) {
        lastError = e;
        if (!isRoutableError(e)) throw e;
      }
    }
    if (!result) throw lastError ?? new Error("No voice is available right now.");

    const switched = used !== original;
    if (switched) {
      await supabase
        .from("ab_books")
        .update({ voice_provider: used.provider, voice_id: used.voiceId, voice_name: used.voiceName ?? used.voiceId, voice_model: used.model ?? null })
        .eq("id", claimed.book_id);
    }

    const path = `${claimed.user_id}/${claimed.book_id}/${claimed.idx}.mp3`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, result.audio, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" });
    if (upErr) throw upErr;

    const { data, error } = await supabase
      .from("ab_chunks")
      .update({
        status: "ready",
        audio_path: path,
        duration_sec: Math.round(result.durationSec * 1000) / 1000,
        timings: sentenceTimings(claimed.text, result.durationSec, result.alignment),
        provider: used.provider,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chunkId)
      .select("*")
      .single();
    if (error) throw error;
    return { claimed: true, chunk: data as ChunkRow, switchedTo: switched ? (used.voiceName ?? used.voiceId) : undefined };
  } catch (e) {
    const { data } = await supabase
      .from("ab_chunks")
      .update({ status: "failed", error: humanError(e), updated_at: new Date().toISOString() })
      .eq("id", chunkId)
      .select("*")
      .single();
    return { claimed: true, chunk: (data as ChunkRow) ?? { ...claimed, status: "failed", error: humanError(e) } };
  }
}
