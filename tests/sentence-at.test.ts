import { describe, expect, it } from "vitest";
import { sentenceAt } from "@/lib/player/sentence-at";

const t = [
  { s: 0, e: 10, t0: 0, t1: 2 },
  { s: 11, e: 30, t0: 2.4, t1: 5 },
  { s: 31, e: 40, t0: 5, t1: 7 },
];

describe("sentenceAt", () => {
  it("returns the sentence being spoken, inclusive of its start", () => {
    expect(sentenceAt(t, 0)).toBe(0);
    expect(sentenceAt(t, 2.4)).toBe(1);
    expect(sentenceAt(t, 6)).toBe(2);
  });
  it("keeps the previous sentence during a pause between sentences", () => {
    expect(sentenceAt(t, 2.2)).toBe(0);
  });
  it("returns the last sentence past the end and -1 with no timings", () => {
    expect(sentenceAt(t, 99)).toBe(2);
    expect(sentenceAt([], 1)).toBe(-1);
  });
  it("returns -1 before the first sentence starts", () => {
    expect(sentenceAt([{ s: 0, e: 4, t0: 0.5, t1: 1 }], 0.1)).toBe(-1);
  });
});
