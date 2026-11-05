import type { CleanPage } from "@/lib/pdf/types";
import type { ChapterDraft, ChapterRow, ChunkDraft } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ENDS_SENTENCE = /[.!?:;"”’)\]]$/;

type Piece = { text: string; page: number };

/** Splits the title's paragraph out of its start page, so text before it stays in the previous chapter. */
function titleIndex(paragraphs: string[], title: string): number {
  const t = norm(title);
  if (!t) return -1;
  return paragraphs.findIndex((p) => {
    const n = norm(p);
    return n === t || (n.startsWith(t) && n.length - t.length < 4) || (t.startsWith(n) && n.length > 3);
  });
}

function sentences(text: string): string[] {
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...seg.segment(text)].map((s) => s.segment);
}

/**
 * Turns cleaned pages into audio-sized chunks (≤ maxChars, sentence boundaries, never crossing a
 * chapter). Each chapter's first chunk opens with the chapter title as its own sentence.
 */
export function buildChunks(
  pages: CleanPage[],
  chapterDrafts: ChapterDraft[],
  maxChars = 1200,
): { chapters: ChapterRow[]; chunks: ChunkDraft[] } {
  const drafts = [...chapterDrafts].sort((a, b) => a.page - b.page);
  const byPage = new Map(pages.map((p) => [p.page, p]));
  const lastPage = Math.max(...pages.map((p) => p.page), 0);

  // 1. Assign paragraphs to chapters.
  const chapterPieces: Piece[][] = drafts.map(() => []);
  drafts.forEach((ch, ci) => {
    const next = drafts[ci + 1];
    const endPage = next ? next.page : lastPage;
    for (let p = ch.page; p <= endPage; p++) {
      const page = byPage.get(p);
      if (!page) continue;
      let paras = page.paragraphs;
      if (p === ch.page) {
        const at = titleIndex(paras, ch.title);
        if (at >= 0) paras = paras.slice(at + 1);
      }
      if (next && p === next.page) {
        const at = titleIndex(page.paragraphs, next.title);
        if (p === ch.page) continue; // two chapters on one page: let the next chapter keep its text
        paras = at >= 0 ? page.paragraphs.slice(0, at) : [];
      }
      for (const text of paras) chapterPieces[ci].push({ text, page: p });
    }
  });

  // 2. Chunk each chapter.
  const chunks: ChunkDraft[] = [];
  const chapters: ChapterRow[] = [];
  drafts.forEach((ch, ci) => {
    const title = ch.title.trim();
    let full = /[.!?:]$/.test(title) ? title : `${title}.`;
    const offsets: { at: number; page: number }[] = [{ at: 0, page: ch.page }];
    for (const piece of chapterPieces[ci]) {
      if (/[a-z]-$/.test(full) && /^[a-z]/.test(piece.text)) {
        // A word hyphenated across a page or paragraph break: "remark-" + "able".
        full = full.slice(0, -1);
      } else {
        full += ENDS_SENTENCE.test(full) ? "\n" : " ";
      }
      offsets.push({ at: full.length, page: piece.page });
      full += piece.text;
    }
    const pageAt = (pos: number) => {
      let page = ch.page;
      for (const o of offsets) if (o.at <= pos) page = o.page;
      return page;
    };

    const firstChunk = chunks.length;
    let current = "";
    let currentStart = 0;
    let pos = 0;
    const flush = () => {
      const text = current.trim();
      if (text) chunks.push({ idx: chunks.length, chapterIdx: ci, page: pageAt(currentStart), text });
      current = "";
    };
    const add = (s: string, at: number) => {
      if (!current) currentStart = at;
      current += s;
    };

    for (const s of sentences(full)) {
      if ((current + s).trim().length <= maxChars) {
        add(s, pos);
      } else if (s.trim().length <= maxChars) {
        flush();
        add(s, pos);
      } else {
        let wpos = pos;
        for (const word of s.split(/(?<=\s)/)) {
          if ((current + word).trim().length > maxChars) flush();
          add(word.length > maxChars ? word.slice(0, maxChars) : word, wpos);
          wpos += word.length;
        }
      }
      pos += s.length;
    }
    flush();
    const lastChunk = chunks.length - 1;
    chapters.push({
      idx: ci,
      title,
      firstChunk,
      lastChunk,
      charCount: chunks.slice(firstChunk).reduce((sum, c) => sum + c.text.length, 0),
    });
  });

  return { chapters, chunks };
}
