import { describe, expect, it } from "vitest";
import { sentenceTimings } from "@/lib/tts/timings";

const text = "First sentence here. Second one is a bit longer than the first! Third?";

describe("sentenceTimings", () => {
  it("splits proportionally to characters and covers [0, duration]", () => {
    const t = sentenceTimings(text, 10);
    expect(t).toHaveLength(3);
    expect(t[0].t0).toBe(0);
    expect(t[2].t1).toBeCloseTo(10);
    for (let i = 1; i < t.length; i++) {
      expect(t[i].t0).toBeCloseTo(t[i - 1].t1);
      expect(t[i].t1).toBeGreaterThan(t[i].t0);
    }
    expect(text.slice(t[1].s, t[1].e)).toBe("Second one is a bit longer than the first!");
    expect(t[1].t1 - t[1].t0).toBeGreaterThan(t[0].t1 - t[0].t0);
  });

  it("uses character alignment when it matches the text", () => {
    const chars = [...text];
    const start = chars.map((_, i) => i * 0.1);
    const end = chars.map((_, i) => i * 0.1 + 0.1);
    const t = sentenceTimings(text, 99, { chars, start, end });
    const s2 = text.indexOf("Second");
    expect(t[1].t0).toBeCloseTo(s2 * 0.1);
    expect(t[1].t1).toBeCloseTo((text.indexOf("!") + 1) * 0.1);
  });

  it("falls back to proportional timing when alignment doesn't match", () => {
    const t = sentenceTimings(text, 10, { chars: ["x"], start: [0], end: [1] });
    expect(t[2].t1).toBeCloseTo(10);
  });
});
