import { describe, expect, it } from "vitest";
import { recapSource, shouldOfferRecap } from "@/lib/book/recap";

const chunks = [
  { idx: 0, text: "Alpha one." },
  { idx: 1, text: "Bravo two." },
  { idx: 2, text: "Charlie three." },
  { idx: 3, text: "Delta four." },
];

describe("recapSource", () => {
  it("takes only text before the position, oldest first", () => {
    expect(recapSource(chunks, 3, 4000)).toBe("Alpha one.\nBravo two.\nCharlie three.");
  });
  it("caps at maxChars, keeping the most recent text", () => {
    const r = recapSource(chunks, 3, 25);
    expect(r.length).toBeLessThanOrEqual(25);
    expect(r.endsWith("Charlie three.")).toBe(true);
    expect(r).not.toContain("Alpha");
  });
  it("is empty at the start of the book", () => {
    expect(recapSource(chunks, 0)).toBe("");
  });
});

describe("shouldOfferRecap", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  it("offers after more than a day away, past the first part", () => {
    expect(shouldOfferRecap(5, "2026-11-03T12:00:00Z", now)).toBe(true);
  });
  it("doesn't offer within a day or at the start", () => {
    expect(shouldOfferRecap(5, "2026-11-05T01:00:00Z", now)).toBe(false);
    expect(shouldOfferRecap(0, "2026-11-01T01:00:00Z", now)).toBe(false);
    expect(shouldOfferRecap(5, null, now)).toBe(false);
  });
});
