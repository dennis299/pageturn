import { describe, expect, it } from "vitest";
import { chunksToGenerate, needsApproval } from "@/lib/player/queue";
import type { ChunkStatus } from "@/lib/db/types";

const chapters = [
  { idx: 0, firstChunk: 0, lastChunk: 9 },
  { idx: 1, firstChunk: 10, lastChunk: 19 },
  { idx: 2, firstChunk: 20, lastChunk: 29 },
];
const chunks = (ready: number[] = [], failed: number[] = []) =>
  Array.from({ length: 30 }, (_, idx) => ({
    idx,
    chapter_idx: Math.floor(idx / 10),
    status: (ready.includes(idx) ? "ready" : failed.includes(idx) ? "failed" : "pending") as ChunkStatus,
  }));

describe("chunksToGenerate", () => {
  it("stays within the current chapter early on", () => {
    expect(chunksToGenerate(chunks(), chapters, 2)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("adds the next chapter once half of the current one is ready or played", () => {
    const r = chunksToGenerate(chunks([0, 1, 2, 3, 4]), chapters, 3);
    expect(r).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it("skips ready and failed chunks", () => {
    expect(chunksToGenerate(chunks([2, 3], [4]), chapters, 2)).toEqual([5, 6, 7, 8, 9]);
  });

  it("never goes past the last chapter", () => {
    expect(chunksToGenerate(chunks(), chapters, 28)).toEqual([28, 29]);
  });
});

describe("needsApproval", () => {
  const book = { voice_provider: "elevenlabs" as const, approved_chapters: [] as number[], auto_continue: true };
  const credits = (amount: number) => ({ unit: "credits" as const, amount });

  it("never asks for free voices", () => {
    expect(needsApproval({ ...book, voice_provider: "openrouter" }, 0, { unit: "free", amount: 0 })).toBe(false);
  });

  it("asks before the first paid chapter is generated", () => {
    expect(needsApproval(book, 0, credits(500), 18_000)).toBe(true);
  });

  it("doesn't ask again for an approved chapter", () => {
    expect(needsApproval({ ...book, approved_chapters: [0] }, 0, credits(500), 18_000)).toBe(false);
  });

  it("continues automatically to later chapters when auto-continue is on", () => {
    expect(needsApproval({ ...book, approved_chapters: [0] }, 1, credits(500), 18_000)).toBe(false);
  });

  it("asks when a chapter would use more than 10% of the remaining ElevenLabs credits", () => {
    expect(needsApproval({ ...book, approved_chapters: [0] }, 1, credits(2_000), 18_000)).toBe(true);
  });

  it("asks for every chapter when auto-continue is off", () => {
    expect(needsApproval({ ...book, approved_chapters: [0], auto_continue: false }, 1, credits(10), 18_000)).toBe(true);
  });

  it("asks for paid Gemini only on the first chapter", () => {
    const g = { ...book, voice_provider: "gemini" as const };
    expect(needsApproval(g, 0, { unit: "usd", amount: 0.2 })).toBe(true);
    expect(needsApproval({ ...g, approved_chapters: [0] }, 1, { unit: "usd", amount: 0.2 })).toBe(false);
  });
});

describe("needsApproval when you turned off 'ask before paid chapters'", () => {
  const book = { voice_provider: "elevenlabs" as const, approved_chapters: [] as number[], auto_continue: true };
  it("never asks, even for the first chapter or a big one; running out of credit is handled by auto-routing", () => {
    expect(needsApproval(book, 0, { unit: "credits", amount: 50_000 }, 14_000, false)).toBe(false);
  });
  it("still asks when the switch is on (the default)", () => {
    expect(needsApproval(book, 0, { unit: "credits", amount: 500 }, 14_000)).toBe(true);
  });
});
