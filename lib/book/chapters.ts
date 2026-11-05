import type { HeadingCandidate, OutlineEntry } from "@/lib/pdf/types";
import type { ChapterDraft } from "./types";

const CHAPTERISH = /^(chapter|part|book|prologue|epilogue|introduction|preface|conclusion)\b|^\d+\.?\s+\S|^[IVXLC]+\.?\s/i;

function onePerPage(list: ChapterDraft[]): ChapterDraft[] {
  const out: ChapterDraft[] = [];
  for (const c of [...list].sort((a, b) => a.page - b.page)) {
    if (!out.length || out[out.length - 1].page !== c.page) out.push(c);
  }
  return out;
}

/**
 * Finds chapters without AI: the PDF's own top-level bookmarks first, then headings that look like
 * chapter titles (or are much larger than body text). Returns null when fewer than two are found.
 */
export function detectChapters(i: {
  outline: OutlineEntry[];
  candidates: HeadingCandidate[];
  bodyFontSize: number;
  startPage: number;
  endPage: number;
}): ChapterDraft[] | null {
  const inRange = (p: number) => p >= i.startPage && p <= i.endPage;

  const fromOutline = onePerPage(
    i.outline.filter((o) => o.depth === 0 && inRange(o.page) && o.title).map((o) => ({ title: o.title, page: o.page })),
  );
  if (fromOutline.length >= 2) return fromOutline;

  const fromHeadings = onePerPage(
    i.candidates
      .filter((c) => inRange(c.page) && (CHAPTERISH.test(c.text) || c.fontSize >= 1.5 * i.bodyFontSize))
      .map((c) => ({ title: c.text, page: c.page })),
  );
  return fromHeadings.length >= 2 ? fromHeadings : null;
}

/** Evenly sized parts when a book has no detectable chapters. */
export function fallbackChapters(startPage: number, endPage: number, every = 25): ChapterDraft[] {
  const out: ChapterDraft[] = [];
  for (let p = startPage, n = 1; p <= endPage; p += every, n++) out.push({ title: `Part ${n}`, page: p });
  return out;
}

/** Makes sure nothing between the chosen start page and the first chapter is skipped. */
export function ensureStart(chapters: ChapterDraft[], startPage: number): ChapterDraft[] {
  const sorted = [...chapters].sort((a, b) => a.page - b.page);
  if (!sorted.length || sorted[0].page > startPage) return [{ title: "Opening", page: startPage }, ...sorted];
  return sorted;
}
