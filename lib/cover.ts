/** Cloth colours for generated book covers. */
export const CLOTHS = ["#1e4636", "#5a1f24", "#1c2c4a", "#6b4f17", "#3e2440", "#2c3a3f", "#134447", "#4a2a1a"];

/** Stable cloth colour for a book, picked from its id. */
export function clothFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CLOTHS[h % CLOTHS.length];
}
