import { describe, expect, it } from "vitest";
import { bookTint, clothFor, coverSrc, dominantColor, looksLikeCover, luminance } from "@/lib/cover";

/** An image made of solid blocks: [r, g, b, pixelCount][]. */
function image(...blocks: [number, number, number, number][]): Uint8ClampedArray {
  const total = blocks.reduce((s, b) => s + b[3], 0);
  const out = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [r, g, b, n] of blocks) {
    for (let k = 0; k < n; k++, i += 4) out.set([r, g, b, 255], i);
  }
  return out;
}

const hueOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return -1;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe("dominantColor", () => {
  it("picks the vivid colour of a cover, not its white paper or black type", () => {
    const hex = dominantColor(image([255, 255, 255, 500], [10, 10, 10, 200], [200, 30, 40, 300]));
    expect(hueOf(hex)).toBeGreaterThan(340);
  });

  it("follows the colour that covers the most area", () => {
    const hex = dominantColor(image([30, 80, 200, 700], [220, 160, 20, 100]));
    const hue = hueOf(hex);
    expect(hue).toBeGreaterThan(200);
    expect(hue).toBeLessThan(250);
  });

  it("always returns a background that white text is readable on", () => {
    for (const block of [[255, 235, 60], [120, 255, 120], [250, 250, 250], [200, 30, 40], [40, 220, 230]] as const) {
      const hex = dominantColor(image([block[0], block[1], block[2], 400]));
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect((1 + 0.05) / (luminance(hex) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives a quiet neutral for a black-and-white cover", () => {
    const hex = dominantColor(image([240, 240, 240, 500], [20, 20, 20, 500]));
    expect(hueOf(hex) === -1 || luminance(hex) < 0.1).toBe(true);
  });
});

describe("looksLikeCover", () => {
  it("rejects a plain title page: black text on white paper", () => {
    expect(looksLikeCover(image([255, 255, 255, 920], [20, 20, 20, 80]))).toBe(false);
  });
  it("accepts a page filled with artwork", () => {
    expect(looksLikeCover(image([30, 60, 120, 700], [255, 255, 255, 300]))).toBe(true);
  });
});

describe("bookTint and coverSrc", () => {
  const id = "a8640e75-f02f-421f-8d4a-263ca1053de8";
  it("uses the cover's colour when the book has one, else its cloth", () => {
    expect(bookTint({ id, cover_color: "#123abc" })).toBe("#123abc");
    expect(bookTint({ id, cover_color: null })).toBe(clothFor(id));
    expect(bookTint({ id, cover_color: "red; background:url(x)" })).toBe(clothFor(id));
  });
  it("versions the cover address by its file name, so a new photo is never served stale", () => {
    expect(coverSrc({ id, cover_path: null })).toBeNull();
    expect(coverSrc({ id, cover_path: `u/${id}/cover-abc.jpg` })).toBe(`/api/books/${id}/cover?v=cover-abc.jpg`);
  });
});
