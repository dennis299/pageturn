"use client";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { api } from "@/lib/api";
import { dominantColor, looksLikeCover } from "@/lib/cover";
import { BUCKET } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export type MadeCover = { blob: Blob; color: string; photoLike: boolean };
export type SavedCover = { cover_path: string; cover_color: string };

/** Covers are stored at this width (2:3), plenty for a phone and small to download. */
const WIDTH = 600;
const HEIGHT = 900;

/** Crops any drawable to a 2:3 cover, reads its colour, and encodes it as a JPEG. */
async function fromDrawable(src: CanvasImageSource, sw: number, sh: number): Promise<MadeCover> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Cover-fit: fill the frame, cropping the overflow evenly.
  const scale = Math.max(WIDTH / sw, HEIGHT / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(src, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);

  const probe = document.createElement("canvas");
  probe.width = 60;
  probe.height = 90;
  const pctx = probe.getContext("2d", { willReadFrequently: true })!;
  pctx.drawImage(canvas, 0, 0, 60, 90);
  const pixels = pctx.getImageData(0, 0, 60, 90).data;
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.84));
  canvas.width = canvas.height = probe.width = probe.height = 0;
  if (!blob) throw new Error("Couldn't make the cover image.");
  return { blob, color: dominantColor(pixels), photoLike: looksLikeCover(pixels) };
}

/** The PDF's first page as a cover. `photoLike` is false for a plain black-on-white title page. */
export async function coverFromPdf(pdf: PDFDocumentProxy, pageNumber = 1): Promise<MadeCover> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, (WIDTH * 1.5) / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  try {
    return await fromDrawable(canvas, canvas.width, canvas.height);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** A photo you picked (from your camera roll or files) as a cover. */
export async function coverFromFile(file: File): Promise<MadeCover> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a picture. Choose a photo or image file.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("We couldn't open that picture. Try a JPEG or PNG.");
  try {
    return await fromDrawable(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Uploads a cover and points the book at it. Returns the new cover fields. */
export async function saveCover(bookId: string, cover: Pick<MadeCover, "blob" | "color">): Promise<SavedCover> {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please log in again.");
  // A new file name per photo, so a changed cover is never served from a stale cache.
  const path = `${u.user.id}/${bookId}/cover-${Date.now().toString(36)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, cover.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error("Couldn't save the cover. Check your connection.");
  await api(`/api/books/${bookId}`, { method: "PATCH", json: { coverPath: path, coverColor: cover.color } });
  return { cover_path: path, cover_color: cover.color };
}

/** Removes a book's cover photo: it goes back to its cloth cover. */
export async function removeCover(bookId: string): Promise<void> {
  await api(`/api/books/${bookId}`, { method: "PATCH", json: { coverPath: null, coverColor: null } });
}

/** Opens the copy of the PDF kept with a book. */
async function openSource(sourcePath: string): Promise<PDFDocumentProxy> {
  const { data, error } = await createClient().storage.from(BUCKET).download(sourcePath);
  if (error || !data) throw new Error("The original PDF isn't available.");
  const { openPdf } = await import("@/lib/pdf/load");
  return openPdf(await data.arrayBuffer());
}

/** Makes a cover from the first page of a book's stored PDF and saves it. */
export async function coverFromSource(book: { id: string; source_path: string | null }, opts: { onlyIfPhotoLike?: boolean } = {}): Promise<SavedCover | null> {
  if (!book.source_path) return null;
  const pdf = await openSource(book.source_path);
  try {
    const made = await coverFromPdf(pdf);
    if (opts.onlyIfPhotoLike && !made.photoLike) return null;
    return await saveCover(book.id, made);
  } finally {
    void pdf.loadingTask.destroy();
  }
}

const TRIED = "ab-cover-tried:";
const BACKFILL_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Books added before covers existed get one the first time they're opened: the first page of
 * their PDF, when that page is a real cover. Tried once per device, so it never loops.
 */
export async function backfillCover(book: { id: string; source_path: string | null; cover_path: string | null }): Promise<SavedCover | null> {
  if (book.cover_path || !book.source_path || !navigator.onLine) return null;
  try {
    if (localStorage.getItem(TRIED + book.id)) return null;
    localStorage.setItem(TRIED + book.id, "1");
  } catch {
    return null;
  }
  try {
    const at = book.source_path.lastIndexOf("/");
    const { data } = await createClient().storage.from(BUCKET).list(book.source_path.slice(0, at), { search: book.source_path.slice(at + 1) });
    const size = Number((data?.[0]?.metadata as { size?: number } | undefined)?.size ?? 0);
    // A big PDF isn't worth pulling over mobile data just to look for a cover: "Book details" can still do it.
    if (!size || size > BACKFILL_MAX_BYTES) return null;
    return await coverFromSource(book, { onlyIfPhotoLike: true });
  } catch {
    return null;
  }
}
