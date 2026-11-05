"use client";
import { useEffect, useState } from "react";
import { CloudDownload, CloudOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadChapters, loadOfflineBook, removeDownload } from "@/lib/offline/books";
import { needsApproval } from "@/lib/player/queue";
import { usePlayer, usePlayerStore } from "./player-provider";

/** Saves the current and next chapter for listening without a connection. */
export function DownloadButton() {
  const store = usePlayerStore();
  const book = usePlayer((s) => s.book);
  const pos = usePlayer((s) => s.pos.chunkIdx);
  const [saved, setSaved] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (book) loadOfflineBook(book.id).then((s) => setSaved(s?.chapterIdxs ?? []));
  }, [book]);

  if (!store || !book || !("caches" in globalThis)) return null;
  const s = store.getState();
  const ch = store.chapterOf(pos);
  const targets = [ch?.idx, (ch?.idx ?? -1) + 1].filter((i): i is number => i !== undefined && i >= 0 && i < s.chapters.length);
  const missing = targets.filter((i) => !saved.includes(i));

  async function download() {
    if (!store || !book) return;
    for (const ci of missing) {
      const chapter = s.chapters[ci];
      const cost = store.chapterCost(chapter);
      if (needsApproval(store.getState().book!, ci, cost, store.getState().credits ?? undefined)) {
        const ok = window.confirm(`Downloading “${chapter.title}” makes its audio now with ${book.voice_name} (${cost.label}). Continue?`);
        if (!ok) return;
        await store.approve(ci);
      }
    }
    try {
      const chunks = await downloadChapters(store.getState().book!, s.chapters, store.getState().chunks, missing, (d, t) =>
        setBusy(`Saving ${d} of ${t}`),
      );
      void chunks;
      const snap = await loadOfflineBook(book.id);
      setSaved(snap?.chapterIdxs ?? []);
      toast.success(missing.length > 1 ? "Next two chapters saved for offline" : "Chapter saved for offline");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!book) return;
    await removeDownload(book.id);
    setSaved([]);
    toast.success("Removed downloads for this book");
  }

  if (busy)
    return (
      <Button variant="ghost" className="h-11 justify-start gap-3" disabled>
        <Loader2 className="animate-spin" aria-hidden /> {busy}
      </Button>
    );
  return missing.length ? (
    <Button variant="ghost" className="h-11 justify-start gap-3" onClick={download}>
      <CloudDownload aria-hidden /> Download {missing.length > 1 ? "this and the next chapter" : "this chapter"}
    </Button>
  ) : (
    <Button variant="ghost" className="h-11 justify-start gap-3" onClick={remove}>
      <CloudOff aria-hidden /> Remove downloads ({saved.length} {saved.length === 1 ? "chapter" : "chapters"})
    </Button>
  );
}
