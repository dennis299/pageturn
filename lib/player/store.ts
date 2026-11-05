"use client";
import { toast } from "sonner";
import { BlobUrlCache } from "@/lib/audio/blob-cache";
import type { BookRow, ChunkRow, ProviderId } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/client";
import { estimateCost, type Cost } from "@/lib/tts/cost";
import { loadOfflineBook } from "@/lib/offline/books";
import { mergeProgress, readLocalProgress, writeLocalProgress, type Progress } from "./progress";
import { chunksToGenerate, needsApproval } from "./queue";
import { chapterTimeline, fromChapterTime, toChapterTime, type Timeline } from "./timeline";

export type ChunkMeta = Omit<ChunkRow, "text" | "user_id" | "claimed_at" | "updated_at">;
export type ChapterMeta = { idx: number; title: string; firstChunk: number; lastChunk: number; charCount: number };

export type PlayerState = {
  book: BookRow | null;
  chapters: ChapterMeta[];
  chunks: ChunkMeta[];
  pos: { chunkIdx: number; offsetSec: number };
  playing: boolean;
  /** You pressed play but the audio isn't ready yet. */
  waiting: boolean;
  rate: number;
  sleep: { endsAt: number } | { endOfChapter: true } | null;
  credits: number | null;
  approvalFor: number | null;
  error: string | null;
  finished: boolean;
  offline: boolean;
  lastListenedAt: string | null;
};

export const RATES = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];
const CHUNK_COLS = "id,book_id,idx,chapter_idx,page,char_count,status,audio_path,duration_sec,timings,provider,error";
const SESSION_GAP_MS = 5 * 60_000;
const MAX_PARALLEL = 2;

/** 0.2 s of silence as a WAV data URL; playing it inside a tap unlocks audio on iOS. */
function silentWav(): string {
  const rate = 8000;
  const n = rate / 5;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export const initialPlayerState: PlayerState = {
  book: null,
  chapters: [],
  chunks: [],
  pos: { chunkIdx: 0, offsetSec: 0 },
  playing: false,
  waiting: false,
  rate: 1,
  sleep: null,
  credits: null,
  approvalFor: null,
  error: null,
  finished: false,
  offline: false,
  lastListenedAt: null,
};

/** Owns the single <audio> element and everything about listening to one book. */
export class PlayerStore {
  private state: PlayerState = initialPlayerState;
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement;
  private blobs = new BlobUrlCache(4);
  private loadedChunk: number | null = null;
  private loadToken = 0;
  private inflight = new Set<number>();
  private orPricing: { prompt: number; completion: number } | undefined;
  private texts = new Map<number, string>();
  private sessionId: string | null = null;
  private lastPauseAt = 0;
  private listened = 0;
  private lastTick = 0;
  private lastLocalSave = 0;
  private syncTimer: ReturnType<typeof setInterval> | undefined;
  private unlocked = false;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.setAttribute("playsinline", "");
    this.rateFromStorage();
    this.wireAudio();
    this.wireLifecycle();
  }

  // ---- subscription -------------------------------------------------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- derived ------------------------------------------------------------
  chapterOf(chunkIdx: number): ChapterMeta | undefined {
    return this.state.chapters.find((c) => chunkIdx >= c.firstChunk && chunkIdx <= c.lastChunk);
  }
  timeline(chapter: ChapterMeta): Timeline {
    return chapterTimeline(this.state.chunks.slice(chapter.firstChunk, chapter.lastChunk + 1));
  }
  chapterCost(chapter: ChapterMeta): Cost {
    const b = this.state.book!;
    return estimateCost(chapter.charCount, b.voice_provider, b.voice_model ?? undefined, this.orPricing);
  }

  // ---- loading ------------------------------------------------------------
  async open(bookId: string) {
    if (this.state.book?.id === bookId) {
      this.pump();
      return;
    }
    if (this.state.book) this.stop();
    this.set({ ...initialPlayerState, rate: this.state.rate });
    this.texts.clear();
    this.blobs.clear();
    this.loadedChunk = null;

    const supabase = createClient();
    try {
      const [bookRes, chRes, ckRes, prRes] = await Promise.all([
        supabase.from("ab_books").select("*").eq("id", bookId).single(),
        supabase.from("ab_chapters").select("idx,title,first_chunk,last_chunk,char_count").eq("book_id", bookId).order("idx"),
        supabase.from("ab_chunks").select(CHUNK_COLS).eq("book_id", bookId).order("idx").range(0, 19999),
        supabase.from("ab_progress").select("chunk_idx,offset_sec,updated_at").eq("book_id", bookId).maybeSingle(),
      ]);
      if (bookRes.error) throw bookRes.error;
      if (chRes.error) throw chRes.error;
      if (ckRes.error) throw ckRes.error;
      const server: Progress | undefined = prRes.data
        ? { chunkIdx: prRes.data.chunk_idx, offsetSec: prRes.data.offset_sec, updatedAt: prRes.data.updated_at }
        : undefined;
      this.loadBook(
        bookRes.data as BookRow,
        (chRes.data ?? []).map((c) => ({ idx: c.idx, title: c.title, firstChunk: c.first_chunk, lastChunk: c.last_chunk, charCount: c.char_count })),
        (ckRes.data ?? []) as ChunkMeta[],
        server,
        false,
      );
    } catch (e) {
      const snap = await loadOfflineBook(bookId).catch(() => null);
      if (snap) {
        this.loadBook(snap.book, snap.chapters, snap.chunks, undefined, true);
        for (const [idx, text] of Object.entries(snap.texts)) this.texts.set(Number(idx), text);
      } else {
        this.set({ error: e instanceof Error ? e.message : "Couldn't open this book." });
      }
    }
  }

  private loadBook(book: BookRow, chapters: ChapterMeta[], chunks: ChunkMeta[], server: Progress | undefined, offline: boolean) {
    const merged = mergeProgress(readLocalProgress(book.id), server);
    const last = chunks.length - 1;
    const pos = merged ? { chunkIdx: Math.min(Math.max(0, merged.chunkIdx), last), offsetSec: merged.offsetSec } : { chunkIdx: 0, offsetSec: 0 };
    const lastListenedAt = merged && Date.parse(merged.updatedAt) > 0 ? merged.updatedAt : null;
    this.set({ book, chapters, chunks, pos, offline, finished: Boolean(book.finished_at), lastListenedAt });
    this.updateMediaSession();
    void this.prepareCosts().then(() => this.pump());
    void this.load(pos.chunkIdx, pos.offsetSec, false);
  }

  private async prepareCosts() {
    const b = this.state.book;
    if (!b || this.state.offline) return;
    if (b.voice_provider === "openrouter") {
      const r = await fetch("/api/voices?provider=openrouter").then((r) => r.json()).catch(() => null);
      const v = r?.voices?.find((x: { model?: string }) => x.model === b.voice_model);
      this.orPricing = v?.pricing ?? (b.voice_model?.endsWith(":free") ? { prompt: 0, completion: 0 } : undefined);
    }
    if (b.voice_provider === "elevenlabs") await this.refreshCredits();
  }

  async refreshCredits() {
    const r = await fetch("/api/elevenlabs/credits").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (r) this.set({ credits: r.remaining });
  }

  /** Text of a chunk (for read-along), fetched in small batches. */
  async getText(idx: number): Promise<string | null> {
    if (this.texts.has(idx)) return this.texts.get(idx)!;
    const b = this.state.book;
    if (!b) return null;
    const { data } = await createClient().from("ab_chunks").select("idx,text").eq("book_id", b.id).gte("idx", idx).lte("idx", idx + 4);
    for (const r of data ?? []) this.texts.set(r.idx, r.text);
    return this.texts.get(idx) ?? null;
  }

  // ---- playback -----------------------------------------------------------
  private async load(idx: number, offset: number, autoplay: boolean) {
    const token = ++this.loadToken;
    const chunk = this.state.chunks[idx];
    this.set({ pos: { chunkIdx: idx, offsetSec: offset } });
    this.updateMediaSession();
    if (!chunk || chunk.status !== "ready") {
      this.loadedChunk = null;
      this.set({ waiting: autoplay, playing: false });
      this.pump();
      return;
    }
    try {
      const url = await this.blobs.get(chunk);
      if (token !== this.loadToken) return;
      if (this.loadedChunk !== idx) {
        this.audio.src = url;
        this.loadedChunk = idx;
        await new Promise<void>((res) => {
          if (this.audio.readyState >= 1) return res();
          this.audio.addEventListener("loadedmetadata", () => res(), { once: true });
          this.audio.addEventListener("error", () => res(), { once: true });
        });
      }
      if (token !== this.loadToken) return;
      this.audio.currentTime = Math.min(offset, Math.max(0, (chunk.duration_sec ?? offset) - 0.05));
      this.audio.playbackRate = this.state.rate;
      if (autoplay) await this.audio.play().catch((e) => this.set({ error: `Playback was blocked: ${e.message}`, playing: false }));
      this.set({ waiting: false });
      // Warm up the next chunk.
      const next = this.state.chunks[idx + 1];
      if (next?.status === "ready") this.blobs.get(next).catch(() => {});
    } catch (e) {
      if (token === this.loadToken) this.set({ error: (e as Error).message, waiting: false, playing: false });
    }
  }

  /** Call from a tap. */
  play() {
    if (!this.state.book) return;
    if (!this.unlocked && this.loadedChunk === null) {
      // Unlock the element inside the tap so later async play() calls are allowed on iOS.
      this.audio.src = silentWav();
      this.audio.play().catch(() => {});
    }
    this.unlocked = true;
    this.set({ error: null });
    if (Date.now() - this.lastPauseAt > SESSION_GAP_MS || !this.sessionId) this.sessionId = crypto.randomUUID();
    if (this.state.finished && this.state.pos.chunkIdx >= this.state.chunks.length - 1) {
      this.set({ finished: false });
      return void this.load(0, 0, true);
    }
    if (this.loadedChunk === this.state.pos.chunkIdx) {
      this.audio.playbackRate = this.state.rate;
      this.audio.play().catch((e) => this.set({ error: `Playback was blocked: ${e.message}` }));
    } else {
      void this.load(this.state.pos.chunkIdx, this.state.pos.offsetSec, true);
    }
  }

  pause() {
    this.audio.pause();
    this.set({ waiting: false });
    this.lastPauseAt = Date.now();
    this.saveProgress();
  }

  toggle() {
    if (this.state.playing || this.state.waiting) this.pause();
    else this.play();
  }

  seekTo(chunkIdx: number, offsetSec: number) {
    const autoplay = this.state.playing || this.state.waiting;
    const idx = Math.min(Math.max(0, chunkIdx), this.state.chunks.length - 1);
    if (idx === this.loadedChunk) {
      this.audio.currentTime = offsetSec;
      this.set({ pos: { chunkIdx: idx, offsetSec } });
      this.persistLocal(true);
    } else {
      void this.load(idx, offsetSec, autoplay);
    }
  }

  seekBy(delta: number) {
    const { chunkIdx, offsetSec } = this.state.pos;
    const ch = this.chapterOf(chunkIdx);
    if (!ch) return;
    // Work in book time across neighbouring chapters by hopping chunks.
    let idx = chunkIdx;
    let t = offsetSec + delta;
    const dur = (i: number) => this.state.chunks[i]?.duration_sec ?? this.state.chunks[i]?.char_count / 15;
    while (t < 0 && idx > 0) {
      idx--;
      t += dur(idx);
    }
    while (t > dur(idx) && idx < this.state.chunks.length - 1) {
      t -= dur(idx);
      idx++;
    }
    this.seekTo(idx, Math.max(0, t));
  }

  /** Seek within the current chapter's timeline (for the scrubber). */
  seekChapterTime(t: number) {
    const ch = this.chapterOf(this.state.pos.chunkIdx);
    if (!ch) return;
    const p = fromChapterTime(this.timeline(ch), t);
    this.seekTo(p.chunkIdx, p.offsetSec);
  }

  chapterTime(): { t: number; total: number; chapter: ChapterMeta | undefined } {
    const ch = this.chapterOf(this.state.pos.chunkIdx);
    if (!ch) return { t: 0, total: 0, chapter: undefined };
    const tl = this.timeline(ch);
    return { t: toChapterTime(tl, this.state.pos.chunkIdx, this.state.pos.offsetSec), total: tl.total, chapter: ch };
  }

  jumpChapter(ci: number) {
    const ch = this.state.chapters[ci];
    if (ch) this.seekTo(ch.firstChunk, 0);
  }

  prevChapter() {
    const ch = this.chapterOf(this.state.pos.chunkIdx);
    if (!ch) return;
    const { t } = this.chapterTime();
    this.jumpChapter(t > 5 || ch.idx === 0 ? ch.idx : ch.idx - 1);
  }

  nextChapter() {
    const ch = this.chapterOf(this.state.pos.chunkIdx);
    if (ch && ch.idx < this.state.chapters.length - 1) this.jumpChapter(ch.idx + 1);
  }

  setRate(rate: number) {
    this.audio.playbackRate = rate;
    this.set({ rate });
    try {
      localStorage.setItem("ab-rate", String(rate));
    } catch {}
  }
  private rateFromStorage() {
    try {
      const r = Number(localStorage.getItem("ab-rate"));
      if (RATES.includes(r)) this.state = { ...this.state, rate: r };
    } catch {}
  }

  setSleep(minutes: number | "chapter" | null) {
    if (minutes === null) this.set({ sleep: null });
    else if (minutes === "chapter") this.set({ sleep: { endOfChapter: true } });
    else this.set({ sleep: { endsAt: Date.now() + minutes * 60_000 } });
  }

  /** Forget the open book (after it's deleted). */
  close() {
    this.stop();
    this.blobs.clear();
    this.texts.clear();
    this.loadedChunk = null;
    this.set({ ...initialPlayerState, rate: this.state.rate });
  }

  private stop() {
    this.saveProgress();
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.inflight.clear();
  }

  // ---- generation ---------------------------------------------------------
  /** Starts generating upcoming chunks (at most two at a time), asking first when a paid chapter needs approval. */
  pump() {
    const { book, chunks, chapters, pos, offline } = this.state;
    if (!book || offline || !navigator.onLine) return;
    const todo = chunksToGenerate(
      chunks,
      chapters.map((c) => ({ idx: c.idx, firstChunk: c.firstChunk, lastChunk: c.lastChunk })),
      pos.chunkIdx,
    ).filter((i) => !this.inflight.has(i));

    // The free Gemini key has a low per-minute limit, so Gemini books make one part at a time.
    const parallel = book.voice_provider === "gemini" ? 1 : MAX_PARALLEL;
    for (const idx of todo) {
      if (this.inflight.size >= parallel) break;
      const ch = this.chapterOf(idx);
      if (!ch) continue;
      const cost = this.chapterCost(ch);
      if (needsApproval(this.state.book!, ch.idx, cost, this.state.credits ?? undefined)) {
        if (this.state.approvalFor === null) this.set({ approvalFor: ch.idx });
        break;
      }
      if (cost.unit !== "free" && !this.state.book!.approved_chapters.includes(ch.idx)) void this.recordApproval(ch.idx);
      void this.generate(idx);
    }
  }

  private async generate(idx: number) {
    const chunk = this.state.chunks[idx];
    if (!chunk) return;
    this.inflight.add(idx);
    this.patchChunk(idx, { status: "generating" });
    try {
      const res = await fetch(`/api/chunks/${chunk.id}/generate`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Generation failed (${res.status})`);
      const row = j.chunk as ChunkRow;
      this.patchChunk(idx, {
        status: row.status,
        audio_path: row.audio_path,
        duration_sec: row.duration_sec,
        timings: row.timings,
        error: row.error,
        provider: row.provider,
      });
      if (row.status === "failed") this.set({ error: row.error ?? "Couldn't make the audio for this part." });
      if (j.switchedTo) void this.onVoiceSwitched(j.switchedTo);
      if (row.status === "generating") setTimeout(() => this.refreshChunk(idx), 5000);
      if (row.status === "ready" && this.state.book?.voice_provider === "elevenlabs") void this.refreshCredits();
    } catch (e) {
      this.patchChunk(idx, { status: "failed", error: (e as Error).message });
      this.set({ error: (e as Error).message });
    } finally {
      this.inflight.delete(idx);
    }
    const now = this.state.chunks[idx];
    if (idx === this.state.pos.chunkIdx && now?.status === "ready" && this.loadedChunk !== idx) {
      void this.load(idx, this.state.pos.offsetSec, this.state.waiting);
    } else if (idx === this.state.pos.chunkIdx + 1 && now?.status === "ready") {
      this.blobs.get(now).catch(() => {});
    }
    if (now?.status !== "failed") this.pump();
  }

  /** The server routed to another voice because this one hit a limit: follow it for the rest of the book. */
  private async onVoiceSwitched(name: string) {
    const b = this.state.book;
    if (!b) return;
    toast.message(`Switched to ${name}`, { description: "The previous voice hit its limit, so the rest of the book uses this one." });
    const { data } = await createClient().from("ab_books").select("voice_provider,voice_id,voice_name,voice_model").eq("id", b.id).single();
    if (data) this.set({ book: { ...this.state.book!, ...data } as BookRow });
    this.orPricing = undefined;
    await this.prepareCosts();
  }

  private async refreshChunk(idx: number) {
    const c = this.state.chunks[idx];
    if (!c) return;
    const { data } = await createClient().from("ab_chunks").select(CHUNK_COLS).eq("id", c.id).single();
    if (data) {
      this.patchChunk(idx, data as ChunkMeta);
      if (data.status === "generating") setTimeout(() => this.refreshChunk(idx), 5000);
      else if (data.status === "ready" && idx === this.state.pos.chunkIdx && this.loadedChunk !== idx)
        void this.load(idx, this.state.pos.offsetSec, this.state.waiting);
      else this.pump();
    }
  }

  private patchChunk(idx: number, patch: Partial<ChunkMeta>) {
    const chunks = this.state.chunks.slice();
    if (!chunks[idx]) return;
    chunks[idx] = { ...chunks[idx], ...patch };
    this.set({ chunks });
  }

  private async recordApproval(ci: number) {
    const b = this.state.book!;
    if (b.approved_chapters.includes(ci)) return;
    const approved = [...b.approved_chapters, ci];
    this.set({ book: { ...b, approved_chapters: approved } });
    await createClient().from("ab_books").update({ approved_chapters: approved }).eq("id", b.id);
  }

  async approve(ci: number) {
    await this.recordApproval(ci);
    this.set({ approvalFor: null });
    this.pump();
  }

  declineApproval() {
    this.set({ approvalFor: null, waiting: false });
  }

  async setAutoContinue(on: boolean) {
    const b = this.state.book!;
    this.set({ book: { ...b, auto_continue: on } });
    await createClient().from("ab_books").update({ auto_continue: on }).eq("id", b.id);
  }

  retry(idx: number) {
    this.set({ error: null });
    void this.generate(idx);
  }

  /** Switches the voice for parts that don't have audio yet, and clears failures. */
  async switchVoice(v: { provider: ProviderId; voiceId: string; voiceName: string; model?: string }) {
    const b = this.state.book!;
    const supabase = createClient();
    const patch = { voice_provider: v.provider, voice_id: v.voiceId, voice_name: v.voiceName, voice_model: v.model ?? null, approved_chapters: [] };
    const { error } = await supabase.from("ab_books").update(patch).eq("id", b.id);
    if (error) throw error;
    await supabase.from("ab_chunks").update({ status: "pending", error: null }).eq("book_id", b.id).eq("status", "failed");
    this.set({
      book: { ...b, ...patch },
      chunks: this.state.chunks.map((c) => (c.status === "failed" ? { ...c, status: "pending", error: null } : c)),
      error: null,
      approvalFor: null,
    });
    this.orPricing = undefined;
    await this.prepareCosts();
    this.pump();
  }

  // ---- progress -----------------------------------------------------------
  private persistLocal(force = false) {
    const b = this.state.book;
    if (!b) return;
    const now = Date.now();
    if (!force && now - this.lastLocalSave < 2000) return;
    this.lastLocalSave = now;
    writeLocalProgress(b.id, { ...this.state.pos, updatedAt: new Date(now).toISOString() });
  }

  /** Sends your place (and listening time) to the server; uses sendBeacon when the page is closing. */
  saveProgress(opts: { beacon?: boolean; finished?: boolean } = {}) {
    const b = this.state.book;
    if (!b) return;
    const updatedAt = new Date().toISOString();
    writeLocalProgress(b.id, { ...this.state.pos, updatedAt });
    const body = JSON.stringify({
      bookId: b.id,
      chunkIdx: this.state.pos.chunkIdx,
      offsetSec: Math.round(this.state.pos.offsetSec * 10) / 10,
      updatedAt,
      sessionId: this.sessionId ?? undefined,
      addSeconds: this.listened > 0.5 ? Math.min(600, this.listened) : undefined,
      finished: opts.finished || undefined,
    });
    this.listened = 0;
    if (opts.beacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/progress", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/progress", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {
        queueOfflineProgress(body);
      });
    }
    this.set({ lastListenedAt: updatedAt });
  }

  // ---- audio + page events ------------------------------------------------
  private wireAudio() {
    const a = this.audio;
    a.addEventListener("play", () => {
      if (this.loadedChunk === null) return; // the silent unlock clip
      this.lastTick = performance.now();
      this.set({ playing: true, waiting: false });
      this.startSync();
    });
    a.addEventListener("pause", () => {
      if (this.loadedChunk === null) return;
      this.set({ playing: false });
      this.stopSync();
    });
    a.addEventListener("timeupdate", () => {
      if (this.loadedChunk === null || this.loadedChunk !== this.state.pos.chunkIdx) return;
      const now = performance.now();
      if (!a.paused) this.listened += Math.min(2, Math.max(0, (now - this.lastTick) / 1000));
      this.lastTick = now;
      this.set({ pos: { chunkIdx: this.loadedChunk, offsetSec: a.currentTime } });
      this.persistLocal();
      this.updatePositionState();
      const s = this.state.sleep;
      if (s && "endsAt" in s && Date.now() >= s.endsAt) {
        this.set({ sleep: null });
        this.pause();
      }
    });
    a.addEventListener("ended", () => {
      if (this.loadedChunk === null) return;
      const idx = this.loadedChunk;
      const next = idx + 1;
      if (next >= this.state.chunks.length) {
        this.set({ playing: false, finished: true, pos: { chunkIdx: idx, offsetSec: this.state.chunks[idx]?.duration_sec ?? 0 } });
        this.saveProgress({ finished: true });
        return;
      }
      const s = this.state.sleep;
      const chapterEnds = this.chapterOf(next)?.idx !== this.chapterOf(idx)?.idx;
      if (s && "endOfChapter" in s && chapterEnds) {
        this.set({ sleep: null });
        void this.load(next, 0, false);
        this.saveProgress();
        return;
      }
      void this.load(next, 0, true);
    });
  }

  private startSync() {
    this.stopSync();
    this.syncTimer = setInterval(() => this.saveProgress(), 10_000);
  }
  private stopSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = undefined;
  }

  private wireLifecycle() {
    const flushHidden = () => {
      if (document.visibilityState === "hidden") this.saveProgress({ beacon: true });
    };
    document.addEventListener("visibilitychange", flushHidden);
    window.addEventListener("pagehide", () => this.saveProgress({ beacon: true }));
    window.addEventListener("online", () => {
      flushOfflineProgress();
      this.pump();
    });
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      const on = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
        try {
          ms.setActionHandler(action, fn);
        } catch {}
      };
      on("play", () => this.play());
      on("pause", () => this.pause());
      on("seekbackward", (d) => this.seekBy(-(d.seekOffset ?? 15)));
      on("seekforward", (d) => this.seekBy(d.seekOffset ?? 30));
      on("previoustrack", () => this.prevChapter());
      on("nexttrack", () => this.nextChapter());
      on("seekto", (d) => d.seekTime !== undefined && this.seekChapterTime(d.seekTime));
    }
  }

  private updateMediaSession() {
    if (!("mediaSession" in navigator) || !this.state.book) return;
    const ch = this.chapterOf(this.state.pos.chunkIdx);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ch?.title ?? this.state.book.title,
      artist: this.state.book.title,
      album: this.state.book.author ?? "Pageturn",
      artwork: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
  }

  private updatePositionState() {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const { t, total } = this.chapterTime();
    if (!total) return;
    try {
      navigator.mediaSession.setPositionState({ duration: total, position: Math.min(t, total), playbackRate: this.state.rate });
    } catch {}
  }
}

// ---- offline progress queue ----------------------------------------------
const QUEUE_KEY = "ab-progress-queue";
function queueOfflineProgress(body: string) {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as string[];
    q.push(body);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200)));
  } catch {}
}
export async function flushOfflineProgress() {
  let q: string[] = [];
  try {
    q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    localStorage.removeItem(QUEUE_KEY);
  } catch {}
  for (const body of q) {
    await fetch("/api/progress", { method: "POST", body, headers: { "Content-Type": "application/json" } }).catch(() => queueOfflineProgress(body));
  }
}
