import { describe, expect, it } from "vitest";
import { cleanPages } from "@/lib/pdf/clean";
import type { Line, PageText } from "@/lib/pdf/types";

const body = (text: string, y: number, fontSize = 11): Line => ({ text, y, fontSize });

/** A page of body text: lines every 0.03 starting at y=0.15. */
function page(n: number, lines: string[], extra: Line[] = []): PageText {
  return { page: n, lines: [...extra, ...lines.map((t, i) => body(t, 0.15 + i * 0.03))] };
}

const filler = ["The quick brown fox jumps over the lazy dog again and again.", "It keeps on running through the field until night."];

describe("cleanPages", () => {
  it("removes page-number footers like 'Page 12' and '12'", () => {
    const pages = [
      page(1, filler, [body("Page 12", 0.95)]),
      page(2, filler, [body("13", 0.95)]),
      page(3, filler, [body("xiv", 0.04)]),
    ];
    const text = cleanPages(pages).pages.flatMap((p) => p.paragraphs).join(" ");
    expect(text).not.toMatch(/Page 12|\b13\b|xiv/);
  });

  it("removes a running header repeated on 5 of 10 pages", () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      page(i + 1, filler, i % 2 === 0 ? [body(`THE GREAT BOOK ${i + 1}`, 0.05, 9)] : []),
    );
    const text = cleanPages(pages).pages.flatMap((p) => p.paragraphs).join(" ");
    expect(text).not.toContain("THE GREAT BOOK");
  });

  it("keeps a body sentence that starts with a number", () => {
    const pages = [page(1, ["1984 was the year everything changed for the company and its founders."])];
    expect(cleanPages(pages).pages[0].paragraphs.join(" ")).toContain("1984 was the year");
  });

  it("joins a word hyphenated across lines", () => {
    const pages = [page(1, ["This is a very good exam-", "ple of joining lines."])];
    expect(cleanPages(pages).pages[0].paragraphs[0]).toBe("This is a very good example of joining lines.");
  });

  it("keeps a real hyphen before a capitalised word", () => {
    const pages = [page(1, ["The research was well-", "Known across the world."])];
    expect(cleanPages(pages).pages[0].paragraphs[0]).toContain("well-Known");
  });

  it("drops small footnote lines at the bottom", () => {
    const pages = [page(1, filler, [body("1. See the appendix for the full data set.", 0.88, 8)])];
    expect(cleanPages(pages).pages[0].paragraphs.join(" ")).not.toContain("appendix");
  });

  it("starts a new paragraph after a large vertical gap", () => {
    const p: PageText = {
      page: 1,
      lines: [body("First paragraph line one.", 0.2), body("First paragraph line two.", 0.23), body("Second paragraph.", 0.32)],
    };
    expect(cleanPages([p]).pages[0].paragraphs).toEqual(["First paragraph line one. First paragraph line two.", "Second paragraph."]);
  });

  it("collects larger-font lines as heading candidates", () => {
    const pages = [page(1, filler, [body("Chapter One", 0.08, 18)])];
    const out = cleanPages(pages);
    expect(out.pages[0].headings).toEqual([{ page: 1, text: "Chapter One", fontSize: 18 }]);
    expect(out.bodyFontSize).toBe(11);
  });

  it("removes a running header that sits lower on some pages (a section with a deeper top margin)", () => {
    // The real case: the author's name at 2% from the top on most pages, but at 10.7% on one section's pages.
    const deep = (n: number): PageText => ({ page: n, lines: [body("JANE AUTHOR", 0.107, 11), ...filler.map((t, i) => body(t, 0.146 + i * 0.03))] });
    const pages = Array.from({ length: 12 }, (_, i) => (i >= 4 && i < 8 ? deep(i + 1) : page(i + 1, filler, [body("JANE AUTHOR", 0.019, 11)])));
    const text = cleanPages(pages).pages.flatMap((p) => p.paragraphs).join(" ");
    expect(text).not.toContain("JANE AUTHOR");
    expect(text).toContain("The quick brown fox");
  });

  it("removes a header that is the first line of most pages even when it never reaches the very top", () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      page: i + 1,
      lines: [...(i % 2 === 0 ? [body("My Life in Letters", 0.12, 10)] : []), ...filler.map((t, j) => body(t, 0.17 + j * 0.03))],
    }));
    const text = cleanPages(pages).pages.flatMap((p) => p.paragraphs).join(" ");
    expect(text).not.toContain("My Life in Letters");
  });

  it("keeps chapter titles that open several pages, even in body-size type", () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      page: i + 1,
      lines: [...(i % 2 === 0 ? [body(`Chapter ${i / 2 + 1}`, 0.15, 11)] : []), ...filler.map((t, j) => body(t, 0.21 + j * 0.03))],
    }));
    const text = cleanPages(pages).pages.flatMap((p) => p.paragraphs).join(" ");
    for (const n of [1, 2, 3, 4, 5]) expect(text).toContain(`Chapter ${n}`);
  });

  it("keeps a name that appears in the middle of a page, like a sign-off", () => {
    const pages = Array.from({ length: 10 }, (_, i) => page(i + 1, filler, [body("JANE AUTHOR", 0.019, 11)]));
    pages[9].lines.push(body("JANE AUTHOR", 0.67, 11));
    const last = cleanPages(pages).pages[9].paragraphs.join(" ");
    expect(last).toContain("JANE AUTHOR");
  });

  it("flags pages with < 20 chars as needing OCR", () => {
    const pages = [page(1, filler), { page: 2, lines: [body("x", 0.5)] }, { page: 3, lines: [] }];
    expect(cleanPages(pages).needsOcr).toEqual([2, 3]);
  });
});
