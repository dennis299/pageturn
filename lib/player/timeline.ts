import { CHARS_PER_SECOND } from "@/lib/book/progress-math";

type ChunkTime = { idx: number; duration_sec: number | null; char_count: number };
export type Timeline = { idxs: number[]; starts: number[]; durations: number[]; total: number };

/** Start time of every chunk within a chapter (real durations where known, estimates elsewhere). */
export function chapterTimeline(chunks: ChunkTime[]): Timeline {
  const sorted = [...chunks].sort((a, b) => a.idx - b.idx);
  const starts: number[] = [];
  const durations: number[] = [];
  let t = 0;
  for (const c of sorted) {
    starts.push(t);
    const d = c.duration_sec ?? c.char_count / CHARS_PER_SECOND;
    durations.push(d);
    t += d;
  }
  return { idxs: sorted.map((c) => c.idx), starts, durations, total: t };
}

export function toChapterTime(tl: Timeline, chunkIdx: number, offsetSec: number): number {
  const i = tl.idxs.indexOf(chunkIdx);
  return i < 0 ? 0 : tl.starts[i] + Math.min(offsetSec, tl.durations[i]);
}

export function fromChapterTime(tl: Timeline, t: number): { chunkIdx: number; offsetSec: number } {
  if (!tl.idxs.length) return { chunkIdx: 0, offsetSec: 0 };
  let i = tl.starts.findLastIndex((s) => s <= t);
  if (i < 0) i = 0;
  const offset = Math.min(Math.max(0, t - tl.starts[i]), tl.durations[i]);
  return { chunkIdx: tl.idxs[i], offsetSec: Math.round(offset * 1000) / 1000 };
}
