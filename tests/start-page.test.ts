import { describe, expect, it } from "vitest";
import { suggestStartPage } from "@/lib/book/start";

const filler = "word ".repeat(100);
const page = (page: number, paragraphs: string[]) => ({ page, paragraphs, headings: [] });

describe("suggestStartPage", () => {
  it("skips the cover, copyright and contents pages", () => {
    const pages = [
      page(1, ["My Book"]),
      page(2, ["Copyright 2020. All rights reserved."]),
      page(3, ["Contents", "Chapter 1 .... 5", filler]),
      page(4, ["Chapter 2 .... 30", filler]),
      page(5, ["Chapter 1", filler]),
    ];
    expect(suggestStartPage(pages)).toBe(5);
  });

  it("picks the first page with real text when there is no contents page", () => {
    expect(suggestStartPage([page(1, ["Title"]), page(2, [filler]), page(3, [filler])])).toBe(2);
  });

  it("falls back to page 1", () => {
    expect(suggestStartPage([page(1, ["short"])])).toBe(1);
  });
});
