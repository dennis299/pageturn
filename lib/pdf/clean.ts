import type { CleanPage, HeadingCandidate, Line, PageText } from "./types";

const PAGE_NUMBER = /^\s*(page\s*)?\d{1,4}\s*$/i;
const ROMAN = /^\s*[ivxlcdm]{1,7}\s*$/i;
const EDGE = 0.1;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

const atEdge = (l: Line) => l.y < EDGE || l.y > 1 - EDGE;
const repeatKey = (t: string) => t.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim();
const nonSpace = (t: string) => t.replace(/\s/g, "").length;

/**
 * Turns raw PDF lines into readable paragraphs: drops page numbers, running headers/footers and
 * footnotes, joins hyphenated words, and collects heading candidates for chapter detection.
 */
export function cleanPages(pages: PageText[]): { pages: CleanPage[]; bodyFontSize: number; needsOcr: number[] } {
  const allLines = pages.flatMap((p) => p.lines).filter((l) => l.text.trim());
  const bodyFontSize = median(allLines.map((l) => l.fontSize)) || 11;

  // Running headers/footers: the same edge text (ignoring numbers) on many pages.
  const seen = new Map<string, Set<number>>();
  for (const p of pages)
    for (const l of p.lines) {
      if (!atEdge(l)) continue;
      const k = repeatKey(l.text);
      if (k.length < 3) continue;
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k)!.add(p.page);
    }
  const repeatThreshold = Math.max(3, Math.ceil(0.3 * pages.length));
  const repeated = new Set([...seen].filter(([, set]) => set.size >= repeatThreshold).map(([k]) => k));

  const keep = (l: Line) => {
    if (!l.text.trim()) return false;
    if (atEdge(l) && (PAGE_NUMBER.test(l.text) || ROMAN.test(l.text))) return false;
    if (atEdge(l) && repeated.has(repeatKey(l.text))) return false;
    if (l.y > 0.75 && l.fontSize < 0.85 * bodyFontSize) return false;
    return true;
  };

  const kept = pages.map((p) => ({ page: p.page, lines: p.lines.filter(keep).sort((a, b) => a.y - b.y) }));

  // Typical line spacing: the lower quartile of gaps between consecutive lines.
  const gaps = kept.flatMap((p) => p.lines.slice(1).map((l, i) => l.y - p.lines[i].y)).filter((g) => g > 0);
  const lineGap = quantile(gaps, 0.25) || 0.03;

  const needsOcr = pages.filter((p) => nonSpace(p.lines.map((l) => l.text).join("")) < 20).map((p) => p.page);

  const out: CleanPage[] = kept.map((p) => {
    const paragraphs: string[] = [];
    const headings: HeadingCandidate[] = [];
    let current = "";
    let prev: Line | undefined;
    for (const l of p.lines) {
      const text = l.text.replace(/\s+/g, " ").trim();
      const isHeading = l.fontSize >= 1.25 * bodyFontSize && text.length < 120;
      if (isHeading) headings.push({ page: p.page, text, fontSize: l.fontSize });

      const breakHere =
        !prev ||
        l.y - prev.y > 1.6 * lineGap ||
        Math.abs(l.fontSize - prev.fontSize) > 0.15 * bodyFontSize;
      if (breakHere) {
        if (current) paragraphs.push(current);
        current = text;
      } else if (/[a-z]-$/.test(current) && /^[a-z]/.test(text)) {
        current = current.slice(0, -1) + text;
      } else if (/-$/.test(current)) {
        current += text;
      } else {
        current += " " + text;
      }
      prev = l;
    }
    if (current) paragraphs.push(current);
    return { page: p.page, paragraphs, headings };
  });

  return { pages: out, bodyFontSize, needsOcr };
}
