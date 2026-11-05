import { describe, expect, it } from "vitest";
import { buildChunks } from "@/lib/book/chunk";
import type { CleanPage } from "@/lib/pdf/types";

const sentence = (i: number) => `This is sentence number ${i} and it has a reasonable length for reading aloud.`;
const pg = (page: number, paragraphs: string[]): CleanPage => ({ page, paragraphs, headings: [] });

describe("buildChunks", () => {
  const pages = [
    pg(1, ["Chapter One", Array.from({ length: 40 }, (_, i) => sentence(i)).join(" ")]),
    pg(2, [Array.from({ length: 10 }, (_, i) => sentence(100 + i)).join(" ")]),
    pg(3, ["Chapter Two", Array.from({ length: 30 }, (_, i) => sentence(200 + i)).join(" ")]),
  ];
  const chapters = [
    { title: "Chapter One", page: 1 },
    { title: "Chapter Two", page: 3 },
  ];
  const out = buildChunks(pages, chapters, 1200);

  it("never exceeds the max chunk size", () => {
    for (const c of out.chunks) expect(c.text.length).toBeLessThanOrEqual(1200);
  });

  it("never spans chapters and records chapter ranges", () => {
    expect(out.chapters).toHaveLength(2);
    const [a, b] = out.chapters;
    expect(a.firstChunk).toBe(0);
    expect(b.firstChunk).toBe(a.lastChunk + 1);
    expect(b.lastChunk).toBe(out.chunks.length - 1);
    for (const c of out.chunks) {
      const ch = out.chapters[c.chapterIdx];
      expect(c.idx).toBeGreaterThanOrEqual(ch.firstChunk);
      expect(c.idx).toBeLessThanOrEqual(ch.lastChunk);
    }
    expect(out.chunks.find((c) => c.text.includes("sentence number 200"))?.chapterIdx).toBe(1);
  });

  it("does not split sentences shorter than the max", () => {
    for (const c of out.chunks) expect(c.text.trim()).toMatch(/[.!?:]$|^Chapter/);
  });

  it("starts each chapter with its title once", () => {
    const first = out.chunks[out.chapters[1].firstChunk].text;
    expect(first.startsWith("Chapter Two.")).toBe(true);
    expect(first.match(/Chapter Two/g)).toHaveLength(1);
  });

  it("numbers chunks contiguously from 0 and keeps all the text", () => {
    out.chunks.forEach((c, i) => expect(c.idx).toBe(i));
    const all = out.chunks.map((c) => c.text).join(" ");
    for (const i of [0, 39, 105, 229]) expect(all).toContain(`number ${i} `);
    expect(out.chapters[0].charCount + out.chapters[1].charCount).toBe(out.chunks.reduce((s, c) => s + c.text.length, 0));
  });

  it("records the page each chunk starts on", () => {
    expect(out.chunks.find((c) => c.text.includes("number 105"))?.page).toBe(2);
  });

  it("splits an unpunctuated 5000-char run at word boundaries", () => {
    const run = Array.from({ length: 1000 }, (_, i) => `w${i}`).join(" ");
    const r = buildChunks([pg(1, [run])], [{ title: "Only", page: 1 }], 1200);
    for (const c of r.chunks) {
      expect(c.text.length).toBeLessThanOrEqual(1200);
      expect(c.text).not.toMatch(/^\S*\d\s?$/);
    }
    const words = r.chunks.flatMap((c) => c.text.replace(/^Only\.\s+/, "").split(/\s+/));
    expect(words).toContain("w0");
    expect(words).toContain("w999");
    expect(words.every((w) => /^w\d+$/.test(w))).toBe(true);
  });

  it("joins a word hyphenated across a page break", () => {
    const r = buildChunks([pg(1, ["It was a remark-"]), pg(2, ["able evening."])], [{ title: "One", page: 1 }], 1200);
    expect(r.chunks[0].text).toContain("It was a remarkable evening.");
  });

  it("ignores pages before the first chapter", () => {
    const r = buildChunks([pg(1, ["Front matter text."]), pg(2, ["Real start."])], [{ title: "Start", page: 2 }], 1200);
    expect(r.chunks.map((c) => c.text).join(" ")).not.toContain("Front matter");
  });
});
