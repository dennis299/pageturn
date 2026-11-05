/** Share of pixels dark enough to be ink (luminance < 160) in RGBA data. */
export function inkRatio(rgba: Uint8ClampedArray): number {
  const n = rgba.length / 4;
  if (!n) return 0;
  let dark = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    if (lum < 160) dark++;
  }
  return dark / n;
}

/** A page with almost no ink is blank: no point asking AI to read it. */
export function isBlankPage(rgba: Uint8ClampedArray): boolean {
  return inkRatio(rgba) < 0.002;
}
