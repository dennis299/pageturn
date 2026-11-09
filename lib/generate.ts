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
 * voice, uploads `{uid}/{bookId}/{idx}-{take}.mp3` and marks it ready.
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

    // You may have picked another voice while this part was being made. Then this audio is in the
    // wrong voice: drop it and leave the part for the new voice, instead of saving it (or, worse,
    // auto-routing the whole book away from the voice you just picked).
    const { data: nowBook } = await supabase
      .from("ab_books")
      .select("voice_provider,voice_id,voice_model")
      .eq("id", claimed.book_id)
      .single();
    if (nowBook && !sameVoice(nowBook, original)) return { claimed: true, chunk: await release(supabase, claimed) };

    let switched = false;
    if (used !== original) {
      // Only if the book still has the voice that hit its limit, so a voice you picked meanwhile wins.
      const { data: moved } = await supabase
        .from("ab_books")
        .update({ voice_provider: used.provider, voice_id: used.voiceId, voice_name: used.voiceName ?? used.voiceId, voice_model: used.model ?? null })
        .eq("id", claimed.book_id)
        .eq("voice_provider", original.provider)
        .eq("voice_id", original.voiceId)
        .select("id");
      switched = Boolean(moved?.length);
      if (!switched) return { claimed: true, chunk: await release(supabase, claimed) };
    }

    // A fresh file name per take, so a part that's remade (new voice) is never served from a stale cache.
    const path = `${claimed.user_id}/${claimed.book_id}/${claimed.idx}-${Date.now().toString(36)}.mp3`;
    const bucket = supabase.storage.from(BUCKET);
    const { error: upErr } = await bucket.upload(path, result.audio, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" });
    if (upErr) throw upErr;

    // Only while this claim is still the live one: if the player reset the part meanwhile, don't resurrect it.
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
      .eq("status", "generating")
      .eq("claimed_at", claimed.claimed_at)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      await bucket.remove([path]).catch(() => {});
      return { claimed: true, chunk: await currentRow(supabase, chunkId, claimed) };
    }
    if (claimed.audio_path && claimed.audio_path !== path) await bucket.remove([claimed.audio_path]).catch(() => {});
    return { claimed: true, chunk: data as ChunkRow, switchedTo: switched ? (used.voiceName ?? used.voiceId) : undefined };
  } catch (e) {
    const { data } = await supabase
      .from("ab_chunks")
      .update({ status: "failed", error: humanError(e), updated_at: new Date().toISOString() })
      .eq("id", chunkId)
      .eq("status", "generating")
      .eq("claimed_at", claimed.claimed_at)
      .select("*")
      .maybeSingle();
    if (data) return { claimed: true, chunk: data as ChunkRow };
    // The part was reset meanwhile (you changed the voice): this failure belongs to the old voice.
    return { claimed: true, chunk: await currentRow(supabase, chunkId, { ...claimed, status: "failed", error: humanError(e) }) };
  }
}

type BookVoice = { voice_provider: string; voice_id: string; voice_model: string | null };
function sameVoice(b: BookVoice, v: Voice): boolean {
  return b.voice_provider === v.provider && b.voice_id === v.voiceId && (b.voice_model ?? null) === (v.model ?? null);
}

/** Hands an unfinished claim back (status `pending`), so the part is made again with the book's current voice. */
async function release(supabase: SupabaseClient, claimed: ChunkRow): Promise<ChunkRow> {
  const { data } = await supabase
    .from("ab_chunks")
    .update({ status: "pending", claimed_at: null, error: null, updated_at: new Date().toISOString() })
    .eq("id", claimed.id)
    .eq("status", "generating")
    .eq("claimed_at", claimed.claimed_at)
    .select("*")
    .maybeSingle();
  return (data as ChunkRow | null) ?? currentRow(supabase, claimed.id, { ...claimed, status: "pending" });
}

async function currentRow(supabase: SupabaseClient, chunkId: string, fallback: ChunkRow): Promise<ChunkRow> {
  const { data } = await supabase.from("ab_chunks").select("*").eq("id", chunkId).maybeSingle();
  return (data as ChunkRow | null) ?? fallback;
}
