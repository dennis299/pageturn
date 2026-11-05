"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { isBlankPage } from "./ink";

async function renderToCanvas(pdf: PDFDocumentProxy, pageNumber: number, maxWidth: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, maxWidth / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** Renders one page and returns it as a JPEG data URL (for thumbnails). */
export async function renderPageJpeg(pdf: PDFDocumentProxy, pageNumber: number, maxWidth = 1400, quality = 0.82): Promise<string> {
  const canvas = await renderToCanvas(pdf, pageNumber, maxWidth);
  const url = canvas.toDataURL("image/jpeg", quality);
  canvas.width = canvas.height = 0;
  return url;
}

/** Renders a page for AI reading; `blank` is true when the page has no ink (nothing to read). */
export async function renderPageForOcr(pdf: PDFDocumentProxy, pageNumber: number): Promise<{ dataUrl: string; blank: boolean }> {
  const canvas = await renderToCanvas(pdf, pageNumber, 1400);
  const probe = document.createElement("canvas");
  probe.width = 200;
  probe.height = Math.max(1, Math.round((200 * canvas.height) / canvas.width));
  const ctx = probe.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, probe.width, probe.height);
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
  const blank = isBlankPage(ctx.getImageData(0, 0, probe.width, probe.height).data);
  const dataUrl = blank ? "" : canvas.toDataURL("image/jpeg", 0.82);
  canvas.width = canvas.height = probe.width = probe.height = 0;
  return { dataUrl, blank };
}
