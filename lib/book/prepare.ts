import type { CleanPage } from "@/lib/pdf/types";

/** Paragraphs from OCR text: blank lines separate paragraphs; single newlines are joined. */
export function ocrParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/-\n(?=[a-z])/g, "").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** The cleaned pages inside [start, end], with OCR text swapped in for scanned pages. */
export function pagesInRange(clean: CleanPage[], start: number, end: number, ocr: Map<number, string>): CleanPage[] {
  return clean
    .filter((p) => p.page >= start && p.page <= end)
    .map((p) => (ocr.has(p.page) ? { ...p, paragraphs: ocrParagraphs(ocr.get(p.page)!) } : p));
}
