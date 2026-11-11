"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Pause, Play } from "lucide-react";
import { BookCover } from "@/components/book-cover";
import { bookTint } from "@/lib/cover";
import { cn } from "@/lib/utils";
import { usePlayer, usePlayerStore } from "./player-provider";

/** Now-playing strip shown while you browse (above the tab bar on phones, in the side rail on desktop). */
export function MiniPlayer({ variant }: { variant: "bar" | "rail" }) {
  const store = usePlayerStore();
  const book = usePlayer((s) => s.book);
  const playing = usePlayer((s) => s.playing);
  const waiting = usePlayer((s) => s.waiting);
  const chunkIdx = usePlayer((s) => s.pos?.chunkIdx ?? 0);
  const path = usePathname();
  if (!store || !book || path === `/book/${book.id}`) return null;
  const chapter = store.chapterOf(chunkIdx);
  const progress = store.getState().chunks.length ? chunkIdx / store.getState().chunks.length : 0;
  const tint = bookTint(book);

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        variant === "bar" ? "mini-bar border-t border-border bg-card/95 px-4 py-2 backdrop-blur-md" : "rounded-2xl border border-sidebar-border bg-card p-2.5",
      )}
      style={{ backgroundImage: `linear-gradient(100deg, color-mix(in oklab, ${tint} 62%, transparent), transparent 62%)` }}
    >
      <Link href={`/book/${book.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <BookCover id={book.id} title={book.title} coverPath={book.cover_path} progress={progress} size="sm" className="w-9 rounded-[2px_5px_5px_2px]" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{book.title}</span>
          <span className="block truncate text-xs text-foreground/65">{chapter?.title}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => store.toggle()}
        className="play-btn flex size-11 shrink-0 items-center justify-center rounded-full"
        aria-label={playing || waiting ? "Pause" : "Play"}
      >
        {waiting ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : playing ? (
          <Pause className="size-5 fill-current" aria-hidden />
        ) : (
          <Play className="size-5 translate-x-px fill-current" aria-hidden />
        )}
      </button>
    </div>
  );
}
