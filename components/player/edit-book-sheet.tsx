"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, ImagePlus, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BookCover } from "@/components/book-cover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { coverFromFile, coverFromSource, removeCover, saveCover } from "@/lib/cover-image";
import { cn } from "@/lib/utils";
import { usePlayer, usePlayerStore } from "./player-provider";
import { BottomSheet } from "./sheets";

/** Change a book's title, author and cover photo. */
export function EditBookSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const book = usePlayer((s) => s.book);
  if (!book) return null;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Book details">
      {/* Mounted per opening, so the fields always start from the book as it is now. */}
      {open && <EditBookForm key={book.id} onDone={() => onOpenChange(false)} />}
    </BottomSheet>
  );
}

function EditBookForm({ onDone }: { onDone: () => void }) {
  const store = usePlayerStore()!;
  const book = usePlayer((s) => s.book)!;
  const router = useRouter();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [busy, setBusy] = useState<"save" | "cover" | "search" | null>(null);
  const [found, setFound] = useState<{ id: number; title: string; author: string; year: number | null }[] | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  /** Looks the title up among published books. Only the title you typed leaves the app, and only when you press the button. */
  async function findCovers() {
    setBusy("search");
    try {
      const r = await api<{ covers: { id: number; title: string; author: string; year: number | null }[] }>("/api/covers/search", {
        method: "POST",
        json: { q: title.trim() },
      });
      setFound(r.covers);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pickPublished(id: number) {
    await changeCover(async () => {
      const res = await fetch(`/api/covers/image?id=${id}`);
      if (!res.ok) throw new Error("That cover couldn't be loaded. Try another.");
      const blob = await res.blob();
      return saveCover(book.id, await coverFromFile(new File([blob], "cover.jpg", { type: blob.type || "image/jpeg" })));
    }, "Cover changed");
    setFound(null);
  }

  /** Runs a cover change and shows its result on the open book and on the shelf. */
  async function changeCover(work: () => Promise<{ cover_path: string | null; cover_color: string | null } | null>, done: string) {
    setBusy("cover");
    try {
      const saved = await work();
      if (!saved) return toast.message("The PDF's first page isn't available for this book.");
      store.patchBook(saved);
      router.refresh();
      toast.success(done);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const t = title.trim();
    if (!t) return toast.error("A book needs a title.");
    setBusy("save");
    try {
      const a = author.trim() || null;
      await api(`/api/books/${book.id}`, { method: "PATCH", json: { title: t, author: a } });
      store.patchBook({ title: t, author: a });
      router.refresh();
      toast.success("Details saved");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const changed = title.trim() !== book.title || (author.trim() || null) !== (book.author ?? null);
  return (
    <div className="flex flex-col gap-6 pt-1">
      <div className="flex items-start gap-4">
        <BookCover id={book.id} title={title || book.title} coverPath={book.cover_path} size="sm" className="w-24" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Button variant="outline" className="h-11 justify-start gap-3" disabled={busy !== null} onClick={() => picker.current?.click()}>
            {busy === "cover" ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />} Choose a photo
          </Button>
          <Button variant="outline" className="h-11 justify-start gap-3" disabled={busy !== null || title.trim().length < 2} onClick={findCovers}>
            {busy === "search" ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Find the published cover
          </Button>
          {book.source_path && (
            <Button
              variant="outline"
              className="h-11 justify-start gap-3"
              disabled={busy !== null}
              onClick={() => changeCover(() => coverFromSource(book), "Cover set to the PDF's first page")}
            >
              <FileImage aria-hidden /> Use the PDF&apos;s first page
            </Button>
          )}
          {book.cover_path && (
            <Button
              variant="ghost"
              className="h-11 justify-start gap-3 text-destructive"
              disabled={busy !== null}
              onClick={() => changeCover(async () => (await removeCover(book.id), { cover_path: null, cover_color: null }), "Cover photo removed")}
            >
              <Trash2 aria-hidden /> Remove photo
            </Button>
          )}
          <input
            ref={picker}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Choose a cover photo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void changeCover(async () => saveCover(book.id, await coverFromFile(f)), "Cover photo changed");
            }}
          />
        </div>
      </div>

      {found && (
        <div aria-live="polite">
          {found.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published cover was found for “{title.trim()}”. Shorten the title to the book&apos;s name and search again, or choose a photo.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Covers found on Open Library for “{title.trim()}”. Tap the right one.</p>
              <ul className="mt-3 grid grid-cols-3 gap-3">
                {found.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => pickPublished(c.id)}
                      className={cn("press-card block w-full text-left", busy !== null && "opacity-60")}
                      aria-label={`Use the cover of ${c.title}${c.author ? ` by ${c.author}` : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote cover, passed through our own route */}
                      <img src={`/api/covers/image?id=${c.id}&size=M`} alt="" loading="lazy" className="book-cover aspect-[2/3] w-full object-cover" />
                      <span className="mt-1.5 line-clamp-2 block text-xs text-muted-foreground">
                        {c.author || c.title}
                        {c.year ? `, ${c.year}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-title">Title</Label>
        <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 text-base" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-author">Author</Label>
        <Input id="edit-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" className="h-12 text-base" />
      </div>
      <Button className="h-12 text-base" disabled={!changed || busy !== null} onClick={save}>
        {busy === "save" && <Loader2 className="animate-spin" aria-hidden />} Save details
      </Button>
    </div>
  );
}
