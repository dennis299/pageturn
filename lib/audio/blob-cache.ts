"use client";
import { BUCKET } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export const AUDIO_CACHE = "ab-audio-v1";
export const offlineAudioUrl = (chunkId: string) => `/offline-audio/${chunkId}`;

/** A chunk's MP3: from the offline cache if it was downloaded, otherwise from storage. */
export async function getChunkAudio(chunk: { id: string; audio_path: string | null }): Promise<Blob> {
  if ("caches" in window) {
    const hit = await caches.open(AUDIO_CACHE).then((c) => c.match(offlineAudioUrl(chunk.id))).catch(() => undefined);
    if (hit) return hit.blob();
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
    let p = this.urls.get(chunk.id);
    if (!p) {
      p = getChunkAudio(chunk).then((b) => URL.createObjectURL(b));
      p.catch(() => this.urls.delete(chunk.id));
      this.urls.set(chunk.id, p);
      this.trim(chunk.id);
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
    for (const id of chunkIds) {
      this.urls.get(id)?.then((u) => setTimeout(() => URL.revokeObjectURL(u), 30_000)).catch(() => {});
      this.urls.delete(id);
    }
  }

  clear() {
    for (const p of this.urls.values()) p.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    this.urls.clear();
  }
}
