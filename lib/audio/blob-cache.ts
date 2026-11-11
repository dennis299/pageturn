"use client";
import { offlineCopyUsable, takeKey } from "@/lib/audio/take";
import { BUCKET } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export const AUDIO_CACHE = "ab-audio-v1";
export const offlineAudioUrl = (chunkId: string) => `/offline-audio/${chunkId}`;
/** Header on a downloaded copy: the file path of the take it holds. */
export const TAKE_HEADER = "X-Audio-Path";

/** A chunk's MP3: from the offline cache if it was downloaded, otherwise from storage. */
export async function getChunkAudio(chunk: { id: string; audio_path: string | null }): Promise<Blob> {
  if ("caches" in window) {
    const cache = await caches.open(AUDIO_CACHE).catch(() => undefined);
    const hit = await cache?.match(offlineAudioUrl(chunk.id)).catch(() => undefined);
    if (hit) {
      // A part that was remade since it was downloaded (new voice, corrected text) must not play its old recording.
      if (offlineCopyUsable(hit.headers.get(TAKE_HEADER), chunk, navigator.onLine)) return hit.blob();
      if (hit.headers.get(TAKE_HEADER)) void cache?.delete(offlineAudioUrl(chunk.id));
    }
  }
  if (!chunk.audio_path) throw new Error("This part has no audio yet.");
  const { data, error } = await createClient().storage.from(BUCKET).download(chunk.audio_path);
  if (error || !data) throw new Error("Couldn't download the audio. Check your connection.");
  return data.type === "audio/mpeg" ? data : new Blob([data], { type: "audio/mpeg" });
}

/** Keeps a few object URLs alive (current + next chunks) and revokes the rest. */
export class BlobUrlCache {
  private urls = new Map<string, Promise<string>>();
  constructor(private max = 4) {}

  get(chunk: { id: string; audio_path: string | null }): Promise<string> {
    // Keyed by the take, not just the part: a remade part gets its new recording, never the old one.
    const key = takeKey(chunk);
    let p = this.urls.get(key);
    if (!p) {
      p = getChunkAudio(chunk).then((b) => URL.createObjectURL(b));
      p.catch(() => this.urls.delete(key));
      this.urls.set(key, p);
      this.trim(key);
    }
    return p;
  }

  private trim(keep: string) {
    while (this.urls.size > this.max) {
      const oldest = [...this.urls.keys()].find((k) => k !== keep);
      if (!oldest) break;
      this.urls.get(oldest)?.then((u) => setTimeout(() => URL.revokeObjectURL(u), 30_000)).catch(() => {});
      this.urls.delete(oldest);
    }
  }

  /** Forgets these chunks' audio (e.g. they're being remade in another voice). */
  drop(chunkIds: string[]) {
    for (const key of [...this.urls.keys()]) {
      if (!chunkIds.some((id) => key.startsWith(`${id}|`))) continue;
      this.urls.get(key)?.then((u) => setTimeout(() => URL.revokeObjectURL(u), 30_000)).catch(() => {});
      this.urls.delete(key);
    }
  }

  clear() {
    for (const p of this.urls.values()) p.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    this.urls.clear();
  }
}
