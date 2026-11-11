/** Cloth colours for books that have no cover photo. */
export const CLOTHS = ["#1e4636", "#5a1f24", "#1c2c4a", "#6b4f17", "#3e2440", "#2c3a3f", "#134447", "#4a2a1a"];

/** Stable cloth colour for a book, picked from its id. */
export function clothFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CLOTHS[h % CLOTHS.length];
}

type CoverFields = { id: string; cover_path?: string | null; cover_color?: string | null };

/** The colour a book's screens are lit with: taken from its cover photo, else its cloth. */
export function bookTint(book: CoverFields): string {
  return /^#[0-9a-f]{6}$/i.test(book.cover_color ?? "") ? book.cover_color! : clothFor(book.id);
}

/** Where the app loads a book's cover photo from (null when it has none). The file name is the version. */
export function coverSrc(book: CoverFields): string | null {
  if (!book.cover_path) return null;
  const file = book.cover_path.split("/").pop() ?? "";
  return `/api/books/${book.id}/cover?v=${encodeURIComponent(file)}`;
}

// ---- colour maths ---------------------------------------------------------

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, Math.min(1, s), l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const toHex = (rgb: [number, number, number]) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Dark enough that white text on it passes 4.5:1. */
const MAX_LUMINANCE = 0.17;
const NEUTRAL = "#39413f";

/**
 * The colour a cover is "about", as a background white text stays readable on: the most present
 * vivid hue in the image, kept rich but darkened. Greyscale covers give a quiet neutral.
 */
export function dominantColor(rgba: Uint8ClampedArray | Uint8Array): string {
  const BUCKETS = 24;
  const sum = Array.from({ length: BUCKETS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let pixels = 0;
  let vivid = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    pixels++;
    const [h, s, l] = rgbToHsl(rgba[i], rgba[i + 1], rgba[i + 2]);
    // Greys, near-whites and near-blacks say little about a cover's colour.
    const w = s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.7);
    if (w < 0.08) continue;
    vivid += w;
    const b = sum[Math.min(BUCKETS - 1, Math.floor(h / (360 / BUCKETS)))];
    b.w += w;
    b.r += rgba[i] * w;
    b.g += rgba[i + 1] * w;
    b.b += rgba[i + 2] * w;
  }
  if (!pixels || vivid / pixels < 0.015) return NEUTRAL;
  const top = sum.reduce((a, b) => (b.w > a.w ? b : a));
  const [h, s] = rgbToHsl(top.r / top.w, top.g / top.w, top.b / top.w);
  const sat = Math.min(0.72, Math.max(0.38, s));
  let l = 0.4;
  let hex = toHex(hslToRgb(h, sat, l));
  while (luminance(hex) > MAX_LUMINANCE && l > 0.12) {
    l -= 0.02;
    hex = toHex(hslToRgb(h, sat, l));
  }
  return hex;
}

/**
 * Whether a rendered first page is a real cover (artwork, a photo, a coloured design) rather than
 * a plain title page of black text on white paper, which makes a poor cover photo.
 */
export function looksLikeCover(rgba: Uint8ClampedArray | Uint8Array): boolean {
  let pixels = 0;
  let paper = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    pixels++;
    const min = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (min > 225) paper++;
  }
  return pixels > 0 && paper / pixels < 0.6;
}
