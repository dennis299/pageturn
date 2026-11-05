"use client";
import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPageJpeg } from "@/lib/pdf/render";

const cache = new Map<string, string>();

/** A small rendered image of one PDF page. */
export function PageThumb({ pdf, page, docKey }: { pdf: PDFDocumentProxy; page: number; docKey: string }) {
  const key = `${docKey}:${page}`;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const src = cache.get(key) ?? (loaded?.key === key ? loaded.url : null);

  useEffect(() => {
    let live = true;
    if (cache.has(key)) return;
    renderPageJpeg(pdf, page, 360, 0.7)
      .then((url) => {
        cache.set(key, url);
        if (live) setLoaded({ key, url });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pdf, page, key]);

  return (
    <div className="aspect-[3/4] w-full overflow-hidden rounded-md border border-border bg-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL rendered in the browser
        <img src={src} alt={`Page ${page}`} className="size-full object-contain" />
      ) : (
        <div className="size-full animate-pulse bg-muted" />
      )}
    </div>
  );
}
