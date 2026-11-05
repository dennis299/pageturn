type ChapterSpan = { first_chunk: number; last_chunk: number; char_count: number };

/** Speech rate used for estimates: roughly 15 characters per second at 1×. */
export const CHARS_PER_SECOND = 15;

/**
 * Fraction (0..1) of the book already heard: the characters before chunk `posIdx` (from chapter
 * totals) plus an estimate for `offsetSec` into the current chunk (capped at one chunk).
 */
export function progressPercent(chapters: ChapterSpan[], posIdx: number, offsetSec = 0): number {
  const total = chapters.reduce((sum, c) => sum + c.char_count, 0);
  if (total === 0) return 0;
  let before = 0;
  for (const c of chapters) {
    if (posIdx > c.last_chunk) before += c.char_count;
    else if (posIdx >= c.first_chunk) {
      const span = c.last_chunk - c.first_chunk + 1;
      const perChunk = c.char_count / span;
      before += perChunk * (posIdx - c.first_chunk) + Math.min(perChunk, Math.max(0, offsetSec) * CHARS_PER_SECOND);
    }
  }
  return Math.min(1, before / total);
}

/** Estimated listening time left, in seconds at 1×. */
export function remainingSeconds(totalChars: number, percent: number): number {
  return (totalChars * (1 - percent)) / CHARS_PER_SECOND;
}

/** "2 h 10 min" / "14 min" / "40 s". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** "1:05:09" / "4:09". */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
