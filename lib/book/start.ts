import type { CleanPage } from "@/lib/pdf/types";

const CONTENTS = /^(table of )?contents$/i;
const TOC_LINE = /(\.{2,}|…)\s*\d{1,4}\s*$/;

/**
 * Guesses where the book really starts: the first page with at least 400 characters of text,
 * after any table of contents found in the first 30 pages.
 */
export function suggestStartPage(pages: CleanPage[]): number {
  const chars = (p: CleanPage) => p.paragraphs.join(" ").length;
  const early = pages.slice(0, 30);
  let after = 0;
  const tocAt = early.findIndex((p) => p.paragraphs.some((t) => CONTENTS.test(t.trim())));
  if (tocAt >= 0) {
    after = early[tocAt].page;
    // Contents often runs over several pages: skip pages that are mostly "Title .... 12" lines.
    for (const p of early.slice(tocAt + 1)) {
      const tocLines = p.paragraphs.filter((t) => TOC_LINE.test(t.trim())).length;
      if (tocLines > 0 && tocLines >= p.paragraphs.length / 2) after = p.page;
      else break;
    }
  }
  const start = pages.find((p) => p.page > after && chars(p) >= 400);
  return start?.page ?? pages.find((p) => chars(p) >= 400)?.page ?? pages[0]?.page ?? 1;
}
