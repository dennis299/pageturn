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
  const tz = "Africa/Lagos";
  const at = (iso: string) => Date.parse(iso);
  it("offers on the first open of a new calendar day, even if it's under 24 hours", () => {
    // Listened at 23:00 last night, opening at 08:00 this morning (Lagos time).
    expect(shouldOfferRecap({ posIdx: 5, lastListenedAt: "2026-11-05T22:00:00Z", now: at("2026-11-06T07:00:00Z"), timeZone: tz })).toBe(true);
  });
  it("doesn't offer again on the same day", () => {
    expect(shouldOfferRecap({ posIdx: 5, lastListenedAt: "2026-11-06T06:00:00Z", now: at("2026-11-06T12:00:00Z"), timeZone: tz })).toBe(false);
  });
  it("doesn't offer twice once today's recap was heard", () => {
    expect(
      shouldOfferRecap({ posIdx: 5, lastListenedAt: "2026-11-05T20:00:00Z", now: at("2026-11-06T09:00:00Z"), timeZone: tz, recapHeardOn: "2026-11-06" }),
    ).toBe(false);
  });
  it("needs something already heard", () => {
    expect(shouldOfferRecap({ posIdx: 0, lastListenedAt: "2026-11-01T10:00:00Z", now: at("2026-11-06T09:00:00Z"), timeZone: tz })).toBe(false);
    expect(shouldOfferRecap({ posIdx: 5, lastListenedAt: null, now: at("2026-11-06T09:00:00Z"), timeZone: tz })).toBe(false);
  });
});
