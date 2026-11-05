import { describe, expect, it } from "vitest";
import { inkRatio, isBlankPage } from "@/lib/pdf/ink";

function rgba(pixels: number, darkEvery: number | null): Uint8ClampedArray {
  const a = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const v = darkEvery && i % darkEvery === 0 ? 20 : 250;
    a.set([v, v, v, 255], i * 4);
  }
  return a;
}

describe("ink", () => {
  it("is zero for a white page", () => {
    expect(inkRatio(rgba(10_000, null))).toBe(0);
    expect(isBlankPage(rgba(10_000, null))).toBe(true);
  });
  it("counts dark pixels on a page with text", () => {
    expect(inkRatio(rgba(10_000, 20))).toBeCloseTo(0.05);
    expect(isBlankPage(rgba(10_000, 20))).toBe(false);
  });
  it("treats a few specks of noise as blank", () => {
    expect(isBlankPage(rgba(10_000, 2_000))).toBe(true);
  });
});
