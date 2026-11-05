import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "@/lib/env";
import type { ChunkRow, ProviderId } from "@/lib/db/types";
import { getProvider as defaultGetProvider } from "@/lib/tts";
import { sentenceTimings } from "@/lib/tts/timings";
import type { TtsProvider } from "@/lib/tts/types";

type Deps = { getProvider: (id: ProviderId) => Pick<TtsProvider, "synthesize"> };

/** Short, human error text for the player. */
function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 240 ? msg.slice(0, 237) + "…" : msg;
}

/**
 * Generates one chunk's audio exactly once: claims it atomically, synthesizes it with the book's
 * voice, uploads `{uid}/{bookId}/{idx}.mp3` and marks it ready. On failure the chunk is marked
 * `failed` with the reason. It is never retried automatically, so a broken provider can't keep charging.
 */
export async function generateChunk(
  supabase: SupabaseClient,
  chunkId: string,
  deps: Deps = { getProvider: defaultGetProvider },
): Promise<{ claimed: boolean; chunk: ChunkRow }> {
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
      .select("voice_provider,voice_id,voice_model")
      .eq("id", claimed.book_id)
      .single();
    if (bookErr) throw bookErr;

    const result = await deps
      .getProvider(book.voice_provider as ProviderId)
      .synthesize({ text: claimed.text, voiceId: book.voice_id, model: book.voice_model ?? undefined });

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
        provider: book.voice_provider,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chunkId)
      .select("*")
      .single();
    if (error) throw error;
    return { claimed: true, chunk: data as ChunkRow };
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
