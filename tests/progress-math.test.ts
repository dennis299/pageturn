import { describe, expect, it } from "vitest";
import { progressPercent, remainingSeconds } from "@/lib/book/progress-math";

const chapters = [
  { first_chunk: 0, last_chunk: 9, char_count: 1000 },
  { first_chunk: 10, last_chunk: 19, char_count: 3000 },
];

describe("progressPercent", () => {
  it("weights by characters across chapters", () => {
    expect(progressPercent(chapters, 15)).toBeCloseTo(0.625);
  });
  it("is 0 at the start and 1 past the end", () => {
    expect(progressPercent(chapters, 0)).toBe(0);
    expect(progressPercent(chapters, 20)).toBe(1);
  });
  it("counts time already listened inside the current part", () => {
    expect(progressPercent(chapters, 0, 30)).toBeGreaterThan(0);
    expect(progressPercent(chapters, 0, 30)).toBeCloseTo(100 / 4000);
  });
  it("never counts more than one part's worth of time", () => {
    expect(progressPercent(chapters, 0, 9999)).toBeCloseTo(100 / 4000);
  });
  it("handles a book with no chapters", () => {
    expect(progressPercent([], 3)).toBe(0);
  });
});

describe("remainingSeconds", () => {
  it("estimates 15 characters per second at 1x", () => {
    expect(remainingSeconds(4000, 0.5)).toBeCloseTo(2000 / 15);
  });
});
