import { describe, expect, it } from "vitest";
import { chapterTimeline, fromChapterTime, toChapterTime } from "@/lib/player/timeline";

const chunks = [
  { idx: 10, duration_sec: 60, char_count: 900 },
  { idx: 11, duration_sec: null, char_count: 1500 }, // not generated yet: estimated at 15 chars/s
  { idx: 12, duration_sec: 30, char_count: 450 },
];

describe("chapter timeline", () => {
  it("uses real durations where known and estimates the rest", () => {
    const t = chapterTimeline(chunks);
    expect(t.starts).toEqual([0, 60, 160]);
    expect(t.total).toBe(190);
  });

  it("converts a position to chapter time", () => {
    expect(toChapterTime(chapterTimeline(chunks), 11, 20)).toBe(80);
  });

  it("converts chapter time back to a chunk and offset", () => {
    expect(fromChapterTime(chapterTimeline(chunks), 170)).toEqual({ chunkIdx: 12, offsetSec: 10 });
    expect(fromChapterTime(chapterTimeline(chunks), 0)).toEqual({ chunkIdx: 10, offsetSec: 0 });
    expect(fromChapterTime(chapterTimeline(chunks), 999)).toEqual({ chunkIdx: 12, offsetSec: 30 });
  });
});
