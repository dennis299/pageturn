import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { openPdf } from "./load";
import type { ExtractedPdf, Line, OutlineEntry, PageText } from "./types";

type RawItem = { str: string; x: number; y: number; size: number; width: number; eol: boolean };

/** Groups positioned text items into visual lines (top-to-bottom, left-to-right). */
function toLines(items: RawItem[], pageHeight: number): Line[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; size: number; parts: RawItem[] }[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) < Math.max(2, it.size * 0.5)) {
      last.parts.push(it);
      last.size = Math.max(last.size, it.size);
    } else {
      lines.push({ y: it.y, size: it.size, parts: [it] });
    }
  }
  return lines.map((l) => {
    const parts = l.parts.sort((a, b) => a.x - b.x);
    let text = "";
    let end = -Infinity;
    for (const p of parts) {
      // pdf.js can split one word into several pieces; only add a space where there's a visible gap.
      const gap = p.x - end;
      const needsSpace = text && !text.endsWith(" ") && !p.str.startsWith(" ") && gap > p.size * 0.15;
      text += (needsSpace ? " " : "") + p.str;
      end = p.x + p.width;
    }
    return { text: text.replace(/\s+/g, " ").trim(), y: 1 - l.y / pageHeight, fontSize: Math.round(l.size * 10) / 10 };
  });
}

async function readOutline(pdf: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline) return [];
  const out: OutlineEntry[] = [];
  const walk = async (nodes: typeof outline, depth: number) => {
    for (const n of nodes) {
      try {
        const dest = typeof n.dest === "string" ? await pdf.getDestination(n.dest) : n.dest;
        if (dest && dest[0]) {
          const page = typeof dest[0] === "number" ? dest[0] + 1 : (await pdf.getPageIndex(dest[0])) + 1;
          out.push({ title: n.title.trim(), page, depth });
        }
      } catch {
        // A broken bookmark: skip it.
      }
      if (n.items?.length) await walk(n.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return out;
}

/** Reads every page's text with positions and font sizes, plus the bookmarks and metadata. */
export async function extractPdf(
  data: ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pdf: PDFDocumentProxy; extracted: ExtractedPdf }> {
  const pdf = await openPdf(data);
  return { pdf, extracted: await extractFromDoc(pdf, onProgress) };
}

/** Extraction from an already-open document (shared by the browser and tests). */
export async function extractFromDoc(pdf: PDFDocumentProxy, onProgress?: (done: number, total: number) => void): Promise<ExtractedPdf> {
  const pages: PageText[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: RawItem[] = (content.items as TextItem[])
      .filter((i) => typeof i.str === "string")
      .map((i) => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        size: Math.hypot(i.transform[2], i.transform[3]) || i.height,
        width: i.width,
        eol: i.hasEOL,
      }));
    pages.push({ page: n, lines: toLines(items, height) });
    page.cleanup();
    onProgress?.(n, pdf.numPages);
  }
  const meta = (await pdf.getMetadata().catch(() => null))?.info as { Title?: string; Author?: string } | undefined;
  return {
    pageCount: pdf.numPages,
    pages,
    outline: await readOutline(pdf),
    meta: { title: meta?.Title?.trim() || undefined, author: meta?.Author?.trim() || undefined },
  };
}
