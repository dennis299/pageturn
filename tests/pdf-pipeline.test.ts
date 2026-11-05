import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { detectChapters, ensureStart } from "@/lib/book/chapters";
import { buildChunks } from "@/lib/book/chunk";
import { suggestStartPage } from "@/lib/book/start";
import { cleanPages } from "@/lib/pdf/clean";
import { extractFromDoc } from "@/lib/pdf/extract";

describe("PDF pipeline on a real PDF", async () => {
  const data = new Uint8Array(readFileSync("tests/fixtures/sample.pdf"));
  const pdf = (await getDocument({ data }).promise) as unknown as PDFDocumentProxy;
  const extracted = await extractFromDoc(pdf);
  const clean = cleanPages(extracted.pages);

  it("reads metadata and every page", () => {
    expect(extracted.pageCount).toBe(6);
    expect(extracted.meta).toEqual({ title: "The Quiet Library", author: "A. Writer" });
  });

  it("doesn't split words that pdf.js returns in pieces", () => {
    const text = clean.pages.flatMap((p) => p.paragraphs).join(" ");
    expect(text).toContain("for someone to open it");
    expect(text).not.toMatch(/\b[a-z] [a-z]{3,}\b(?<!\ba [a-z]+)/);
  });

  it("removes the running header, page numbers and footnote", () => {
    const text = clean.pages.flatMap((p) => p.paragraphs).join(" ");
    expect(text).not.toContain("THE QUIET LIBRARY");
    expect(text).not.toMatch(/\s[3-5]\s*$/);
    expect(text).not.toContain("footnote");
  });

  it("joins the word hyphenated across pages into one sentence", () => {
    const start = suggestStartPage(clean.pages);
    expect(start).toBe(3);
    const chapters = ensureStart(
      detectChapters({ outline: extracted.outline, candidates: clean.pages.flatMap((p) => p.headings), bodyFontSize: clean.bodyFontSize, startPage: start, endPage: 6 })!,
      start,
    );
    expect(chapters.map((c) => c.title)).toEqual(["Chapter One", "Chapter Two"]);
    const { chunks } = buildChunks(clean.pages.filter((p) => p.page >= start), chapters);
    const all = chunks.map((c) => c.text).join(" ");
    expect(all).toContain("remarkable evening");
    expect(chunks[0].text.startsWith("Chapter One.")).toBe(true);
  });

  it("flags the blank page for OCR", () => {
    expect(clean.needsOcr).toContain(6);
  });
});
