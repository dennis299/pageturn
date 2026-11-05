import type { ChunkStatus, ProviderId } from "@/lib/db/types";

type ChunkState = { idx: number; chapter_idx: number; status: ChunkStatus };
type ChapterSpan = { idx: number; firstChunk: number; lastChunk: number };

/**
 * Which chunks to generate next: the rest of the current chapter, plus the next chapter once half
 * of the current one is ready or already played. Only `pending` chunks are returned (failed ones
 * wait for you to retry).
 */
export function chunksToGenerate(chunks: ChunkState[], chapters: ChapterSpan[], posIdx: number): number[] {
  const ci = chapters.findIndex((c) => posIdx >= c.firstChunk && posIdx <= c.lastChunk);
  if (ci < 0) return [];
  const ch = chapters[ci];
  const byIdx = new Map(chunks.map((c) => [c.idx, c]));
  const pending = (from: number, to: number) => {
    const out: number[] = [];
    for (let i = from; i <= to; i++) if (byIdx.get(i)?.status === "pending") out.push(i);
    return out;
  };

  const list = pending(posIdx, ch.lastChunk);
  const size = ch.lastChunk - ch.firstChunk + 1;
  let covered = 0;
  for (let i = ch.firstChunk; i <= ch.lastChunk; i++) if (i < posIdx || byIdx.get(i)?.status === "ready") covered++;
  const next = chapters[ci + 1];
  if (next && covered / size >= 0.5) list.push(...pending(next.firstChunk, next.lastChunk));
  return list;
}

/**
 * Whether to ask before generating a chapter with a paid voice: always for the first one, for every
 * chapter when auto-continue is off, and for ElevenLabs when a chapter would use more than 10% of
 * the credits left (they're shared with the YouTube channel).
 */
export function needsApproval(
  book: { voice_provider: ProviderId; approved_chapters: number[]; auto_continue: boolean },
  chapterIdx: number,
  chapterCost: { unit: "credits" | "usd" | "free"; amount: number },
  remainingCredits?: number,
): boolean {
  if (chapterCost.unit === "free" || chapterCost.amount === 0) return false;
  if (book.approved_chapters.includes(chapterIdx)) return false;
  if (book.approved_chapters.length === 0) return true;
  if (!book.auto_continue) return true;
  if (book.voice_provider === "elevenlabs" && remainingCredits !== undefined && chapterCost.amount > 0.1 * remainingCredits) return true;
  return false;
}
