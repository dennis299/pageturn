"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** Opens a PDF with pdf.js in the browser (the worker is served from /public). */
export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
}
