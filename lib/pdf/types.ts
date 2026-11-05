export type Line = { text: string; /** 0 = top of page, 1 = bottom */ y: number; fontSize: number };
export type PageText = { page: number; lines: Line[] };
export type OutlineEntry = { title: string; page: number; depth: number };
export type ExtractedPdf = {
  pageCount: number;
  pages: PageText[];
  outline: OutlineEntry[];
  meta: { title?: string; author?: string };
};
export type HeadingCandidate = { page: number; text: string; fontSize: number };
export type CleanPage = { page: number; paragraphs: string[]; headings: HeadingCandidate[] };
