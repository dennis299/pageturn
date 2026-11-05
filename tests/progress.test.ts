import { describe, expect, it } from "vitest";
import { mergeProgress } from "@/lib/player/progress";

const p = (chunkIdx: number, updatedAt: string) => ({ chunkIdx, offsetSec: 3, updatedAt });

describe("mergeProgress", () => {
  it("ignores server progress older than local", () => {
    expect(mergeProgress(p(40, "2026-11-05T10:00:05Z"), p(12, "2026-11-05T09:00:00Z"))?.chunkIdx).toBe(40);
  });
  it("takes newer server progress from another device", () => {
    expect(mergeProgress(p(40, "2026-11-05T10:00:05Z"), p(55, "2026-11-05T11:00:00Z"))?.chunkIdx).toBe(55);
  });
  it("handles a missing side", () => {
    expect(mergeProgress(undefined, p(3, "2026-11-05T10:00:00Z"))?.chunkIdx).toBe(3);
    expect(mergeProgress(p(4, "2026-11-05T10:00:00Z"), undefined)?.chunkIdx).toBe(4);
    expect(mergeProgress(undefined, undefined)).toBeUndefined();
  });
});
