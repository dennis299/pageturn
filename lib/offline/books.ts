"use client";
import { AUDIO_CACHE, offlineAudioUrl, TAKE_HEADER } from "@/lib/audio/blob-cache";
import { offlineCopyUsable } from "@/lib/audio/take";
import { BUCKET } from "@/lib/env";
import type { BookRow, ChunkRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/client";
import type { ChapterMeta, ChunkMeta } from "@/lib/player/store";

export type OfflineSnapshot = {
  book: BookRow;
  chapters: ChapterMeta[];
  chunks: ChunkMeta[];
  texts: Record<number, string>;
  chapterIdxs: number[];
  savedAt: string;
};

const snapUrl = (bookId: string) => `/offline-book/${bookId}`;

export async function loadOfflineBook(bookId: string): Promise<OfflineSnapshot | null> {
  if (!("caches" in window)) return null;
  const hit = await (await caches.open(AUDIO_CACHE)).match(snapUrl(bookId));
  return hit ? ((await hit.json()) as OfflineSnapshot) : null;
}

export async function listOfflineBooks(): Promise<OfflineSnapshot[]> {
  if (!("caches" in window)) return [];
  const cache = await caches.open(AUDIO_CACHE);
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith("/offline-book/"));
  const snaps = await Promise.all(keys.map((k) => cache.match(k).then((r) => r?.json() as Promise<OfflineSnapshot>)));
  return snaps.filter(Boolean);
}

/**
 * Saves chapters for listening without a connection: generates any missing audio (one part at a
 * time), stores the MP3s in Cache Storage, and keeps a snapshot of the book so it opens offline.
 * Approval for paid voices must be handled by the caller before this runs.
 */
export async function downloadChapters(
  book: BookRow,
  chapters: ChapterMeta[],
  chunks: ChunkMeta[],
  chapterIdxs: number[],
  onProgress: (done: number, total: number) => void,
): Promise<ChunkMeta[]> {
  const supabase = createClient();
  const cache = await caches.open(AUDIO_CACHE);
  const wanted = chunks.filter((c) => chapterIdxs.includes(c.chapter_idx));
  const updated = new Map(chunks.map((c) => [c.idx, c]));
  let done = 0;
  onProgress(0, wanted.length);

  for (const c of wanted) {
    let row: ChunkMeta = updated.get(c.idx)!;
    if (row.status !== "ready") {
      const res = await fetch(`/api/chunks/${c.id}/generate`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Couldn't make the audio.");
      const fresh = j.chunk as ChunkRow;
      if (fresh.status !== "ready") throw new Error(fresh.error ?? "Part of this chapter is still being made. Try again in a minute.");
      row = { ...row, status: "ready", audio_path: fresh.audio_path, duration_sec: fresh.duration_sec, timings: fresh.timings };
      updated.set(c.idx, row);
    }
    const saved = await cache.match(offlineAudioUrl(row.id));
    if (!saved || !offlineCopyUsable(saved.headers.get(TAKE_HEADER), row, true)) {
      const { data, error } = await supabase.storage.from(BUCKET).download(row.audio_path!);
      if (error || !data) throw new Error("Download failed. Check your connection.");
      // Labelled with the take it holds, so a part that is remade later isn't played from this copy.
      await cache.put(offlineAudioUrl(row.id), new Response(data, { headers: { "Content-Type": "audio/mpeg", [TAKE_HEADER]: row.audio_path! } }));
    }
    onProgress(++done, wanted.length);
  }

  const { data: textRows } = await supabase
    .from("ab_chunks")
    .select("idx,text")
    .eq("book_id", book.id)
    .in("chapter_idx", chapterIdxs);
  const prev = await loadOfflineBook(book.id);
  const allChunks = [...updated.values()].sort((a, b) => a.idx - b.idx);
  const snap: OfflineSnapshot = {
    book,
    chapters,
    chunks: allChunks,
    texts: { ...(prev?.texts ?? {}), ...Object.fromEntries((textRows ?? []).map((r) => [r.idx, r.text])) },
    chapterIdxs: [...new Set([...(prev?.chapterIdxs ?? []), ...chapterIdxs])].sort((a, b) => a - b),
    savedAt: new Date().toISOString(),
  };
  await cache.put(snapUrl(book.id), new Response(JSON.stringify(snap), { headers: { "Content-Type": "application/json" } }));
  return allChunks;
}

/**
 * Drops downloaded audio for parts that are being remade (new voice), and marks their chapters as
 * no longer saved, so the download button offers to save them again in the new voice.
 */
export async function forgetOfflineAudio(bookId: string, chunkIds: string[]): Promise<void> {
  if (!("caches" in window) || !chunkIds.length) return;
  const snap = await loadOfflineBook(bookId);
  if (!snap) return;
  const cache = await caches.open(AUDIO_CACHE);
  const gone = new Set(chunkIds);
  await Promise.all(chunkIds.map((id) => cache.delete(offlineAudioUrl(id))));
  const stale = new Set(snap.chunks.filter((c) => gone.has(c.id)).map((c) => c.chapter_idx));
  const next: OfflineSnapshot = {
    ...snap,
    chunks: snap.chunks.map((c) => (gone.has(c.id) ? { ...c, status: "pending", audio_path: null } : c)),
    chapterIdxs: snap.chapterIdxs.filter((i) => !stale.has(i)),
  };
  await cache.put(snapUrl(bookId), new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } }));
}

/** Removes a book's downloaded audio and snapshot. */
export async function removeDownload(bookId: string): Promise<void> {
  const snap = await loadOfflineBook(bookId);
  const cache = await caches.open(AUDIO_CACHE);
  if (snap) await Promise.all(snap.chunks.map((c) => cache.delete(offlineAudioUrl(c.id))));
  await cache.delete(snapUrl(bookId));
}

/** Rough size of everything downloaded, in bytes. */
export async function offlineUsage(): Promise<number | null> {
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  return est?.usage ?? null;
}
