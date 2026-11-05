import { describe, expect, it } from "vitest";
import { detectChapters, fallbackChapters } from "@/lib/book/chapters";

const base = { bodyFontSize: 11, startPage: 5, endPage: 200 };

describe("detectChapters", () => {
  it("prefers the PDF outline over heading candidates", () => {
    const r = detectChapters({
      ...base,
      outline: [
        { title: "Cover", page: 1, depth: 0 },
        { title: "One", page: 10, depth: 0 },
        { title: "One point one", page: 12, depth: 1 },
        { title: "Two", page: 40, depth: 0 },
      ],
      candidates: [{ page: 10, text: "Chapter 1", fontSize: 20 }],
    });
    expect(r).toEqual([
      { title: "One", page: 10 },
      { title: "Two", page: 40 },
    ]);
  });

  it("detects 'Chapter N' headings when there is no outline", () => {
    const r = detectChapters({
      ...base,
      outline: [],
      candidates: [
        { page: 7, text: "Chapter 1: Beginnings", fontSize: 14 },
        { page: 9, text: "A pull quote that is big", fontSize: 14 },
        { page: 30, text: "Chapter 2: Trouble", fontSize: 14 },
      ],
    });
    expect(r).toEqual([
      { title: "Chapter 1: Beginnings", page: 7 },
      { title: "Chapter 2: Trouble", page: 30 },
    ]);
  });

  it("returns null when nothing qualifies", () => {
    expect(detectChapters({ ...base, outline: [], candidates: [{ page: 9, text: "Big quote", fontSize: 14 }] })).toBeNull();
  });

  it("keeps one heading per page", () => {
    const r = detectChapters({
      ...base,
      outline: [],
      candidates: [
        { page: 7, text: "Part One", fontSize: 30 },
        { page: 7, text: "Chapter 1", fontSize: 20 },
        { page: 20, text: "Chapter 2", fontSize: 20 },
      ],
    });
    expect(r?.map((c) => c.page)).toEqual([7, 20]);
  });
});

describe("fallbackChapters", () => {
  it("splits into parts every 25 pages", () => {
    expect(fallbackChapters(1, 60)).toEqual([
      { title: "Part 1", page: 1 },
      { title: "Part 2", page: 26 },
      { title: "Part 3", page: 51 },
    ]);
  });
});

import { ensureStart } from "@/lib/book/chapters";
describe("ensureStart", () => {
  it("adds an Opening chapter when the first chapter starts after the chosen start page", () => {
    expect(ensureStart([{ title: "One", page: 9 }], 5)).toEqual([
      { title: "Opening", page: 5 },
      { title: "One", page: 9 },
    ]);
  });
  it("leaves chapters alone when the first one starts on the start page", () => {
    expect(ensureStart([{ title: "One", page: 5 }], 5)).toEqual([{ title: "One", page: 5 }]);
  });
});

import { chapterTitle } from "@/lib/book/chapters";
describe("chapterTitle", () => {
  it("turns bare numbers into 'Chapter N'", () => {
    expect(chapterTitle("4")).toBe("Chapter 4");
    expect(chapterTitle("12.")).toBe("Chapter 12");
    expect(chapterTitle("IV")).toBe("Chapter IV");
  });
  it("leaves real titles alone", () => {
    expect(chapterTitle("Chapter 4: Beginnings")).toBe("Chapter 4: Beginnings");
    expect(chapterTitle("4 The Big Idea")).toBe("4 The Big Idea");
    expect(chapterTitle("Prologue")).toBe("Prologue");
  });
  it("is applied to detected chapters", () => {
    const r = detectChapters({
      outline: [],
      candidates: [
        { page: 7, text: "1", fontSize: 24 },
        { page: 20, text: "2", fontSize: 24 },
      ],
      bodyFontSize: 11,
      startPage: 1,
      endPage: 50,
    });
    expect(r?.map((c) => c.title)).toEqual(["Chapter 1", "Chapter 2"]);
  });
});
