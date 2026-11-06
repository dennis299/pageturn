"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { removeDownload } from "@/lib/offline/books";
import {
  AlignLeft,
  Bookmark,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  ListOrdered,
  Loader2,
  Moon,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Mic,
  Trash2,
  WifiOff,
} from "lucide-react";
import { BookCover } from "@/components/book-cover";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatClock } from "@/lib/book/progress-math";
import { progressPercent } from "@/lib/book/progress-math";
import { cn } from "@/lib/utils";
import { DownloadButton } from "./download-button";
import { usePlayer, usePlayerStore } from "./player-provider";
import { ReadAlong } from "./read-along";
import { RecapCard } from "./recap-card";
import { ApprovalSheet, BookmarksSheet, ChaptersSheet, SleepSheet, SpeedSheet } from "./sheets";
import { VoiceSheet } from "./voice-sheet";

type SheetName = "chapters" | "speed" | "sleep" | "bookmarks" | "voice" | null;

export function PlayerScreen({ bookId }: { bookId: string }) {
  const store = usePlayerStore();
  const book = usePlayer((s) => s.book);
  const error = usePlayer((s) => s.error);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [readAlong, setReadAlong] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("ab-read-along") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void store?.open(bookId);
  }, [store, bookId]);

  const toggleReadAlong = () => {
    setReadAlong((v) => {
      try {
        localStorage.setItem("ab-read-along", v ? "0" : "1");
      } catch {}
      return !v;
    });
  };

  if (!store || !book || book.id !== bookId) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8 text-muted-foreground" role="status">
        {error ? (
          <p className="max-w-sm text-center">
            {error}{" "}
            <Link href="/" className="underline">
              Back to your shelf
            </Link>
          </p>
        ) : (
          <Loader2 className="size-6 animate-spin" aria-label="Opening book" />
        )}
      </div>
    );
  }

  return (
    <div className="pt-safe mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 pb-8 sm:px-8 lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12 lg:py-10">
      <div className="flex flex-col">
        <header className="flex h-14 items-center justify-between">
          <Link href="/" className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Back to shelf">
            <ChevronDown className="size-6 lg:rotate-90" />
          </Link>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Now reading</p>
          <MoreMenu onVoice={() => setSheet("voice")} />
        </header>

        <NowPlaying readAlong={readAlong} onVoice={() => setSheet("voice")} />
        <Transport />
        <SecondaryControls
          readAlong={readAlong}
          onReadAlong={toggleReadAlong}
          open={(s) => setSheet(s)}
        />
        <div className="mt-6 flex flex-col gap-3">
          <StatusLine onSwitchVoice={() => setSheet("voice")} />
          <RecapCard />
        </div>
      </div>

      <section aria-label="Read along" className={cn("mt-8 lg:mt-14 lg:block", readAlong ? "block" : "hidden")}>
        <div className="lg:sticky lg:top-10 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto lg:pr-4">
          <ChapterHeading />
          <ReadAlong className="mt-4 max-w-[65ch]" />
        </div>
      </section>

      <ChaptersSheet open={sheet === "chapters"} onOpenChange={(o) => setSheet(o ? "chapters" : null)} />
      <SpeedSheet open={sheet === "speed"} onOpenChange={(o) => setSheet(o ? "speed" : null)} />
      <SleepSheet open={sheet === "sleep"} onOpenChange={(o) => setSheet(o ? "sleep" : null)} />
      <BookmarksSheet bookId={book.id} open={sheet === "bookmarks"} onOpenChange={(o) => setSheet(o ? "bookmarks" : null)} />
      <VoiceSheet open={sheet === "voice"} onOpenChange={(o) => setSheet(o ? "voice" : null)} />
      <ApprovalSheet />
    </div>
  );
}

function ChapterHeading() {
  const store = usePlayerStore();
  const idx = usePlayer((s) => s.pos.chunkIdx);
  const ch = store?.chapterOf(idx);
  return <h2 className="font-serif text-2xl italic">{ch?.title}</h2>;
}

function NowPlaying({ readAlong, onVoice }: { readAlong: boolean; onVoice: () => void }) {
  const store = usePlayerStore()!;
  const book = usePlayer((s) => s.book)!;
  const idx = usePlayer((s) => s.pos.chunkIdx);
  const offset = usePlayer((s) => Math.floor(s.pos.offsetSec));
  const chapters = usePlayer((s) => s.chapters);
  const ch = store.chapterOf(idx);
  const percent = progressPercent(
    chapters.map((c) => ({ first_chunk: c.firstChunk, last_chunk: c.lastChunk, char_count: c.charCount })),
    idx,
    offset,
  );
  return (
    <div className="mt-2 flex flex-col items-center text-center">
      <BookCover
        id={book.id}
        title={book.title}
        author={book.author}
        progress={percent}
        size="lg"
        className={cn("transition-all duration-300", readAlong && "max-lg:w-28")}
      />
      <h1 className={cn("mt-6 font-serif text-2xl leading-tight text-balance sm:text-3xl", readAlong && "max-lg:mt-4 max-lg:text-xl")}>{book.title}</h1>
      <p className="mt-1 text-muted-foreground italic">{ch ? `${ch.title}` : ""}</p>
      <p className="tabular mt-1 font-mono text-[11px] text-muted-foreground">
        Chapter {(ch?.idx ?? 0) + 1} of {chapters.length} · {Math.round(percent * 100)}%
      </p>
      <button
        type="button"
        onClick={onVoice}
        className="press mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-accent/40"
        aria-label={`Voice: ${book.voice_name}. Change voice`}
      >
        <Mic className="size-4 text-foil" aria-hidden />
        {book.voice_name}
        <span className="text-xs text-muted-foreground">Change</span>
      </button>
    </div>
  );
}

function Scrubber() {
  const store = usePlayerStore()!;
  usePlayer((s) => s.pos.offsetSec);
  usePlayer((s) => s.chunks);
  const { t, total } = store.chapterTime();
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? t;
  const pct = total ? (shown / total) * 100 : 0;
  return (
    <div className="mt-6 w-full">
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(total))}
        step={1}
        value={Math.floor(shown)}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag !== null) store.seekChapterTime(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag !== null) store.seekChapterTime(drag);
          setDrag(null);
        }}
        aria-label="Position in chapter"
        aria-valuetext={`${formatClock(shown)} of ${formatClock(total)}`}
        className="scrubber h-11 w-full cursor-pointer appearance-none bg-transparent"
        style={{ ["--pct" as string]: `${pct}%` }}
      />
      <div className="tabular flex justify-between font-mono text-xs text-muted-foreground">
        <span>{formatClock(shown)}</span>
        <span>-{formatClock(Math.max(0, total - shown))}</span>
      </div>
    </div>
  );
}

function Transport() {
  const store = usePlayerStore()!;
  const playing = usePlayer((s) => s.playing);
  const waiting = usePlayer((s) => s.waiting);
  return (
    <>
      <Scrubber />
      <div className="mt-2 flex items-center justify-center gap-6 sm:gap-10">
        <button type="button" onClick={() => store.seekBy(-15)} className="press flex size-14 items-center justify-center rounded-full hover:bg-muted" aria-label="Back 15 seconds">
          <RotateCcw className="size-7" strokeWidth={1.6} />
          <span className="tabular absolute pt-0.5 font-mono text-[9px] font-medium">15</span>
        </button>
        <button
          type="button"
          onClick={() => store.toggle()}
          className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_30px_-8px_var(--foil)] transition-transform active:scale-95"
          aria-label={playing || waiting ? "Pause" : "Play"}
        >
          {waiting ? <Loader2 className="size-8 animate-spin" /> : playing ? <Pause className="size-8 fill-current" /> : <Play className="size-8 translate-x-0.5 fill-current" />}
        </button>
        <button type="button" onClick={() => store.seekBy(30)} className="press flex size-14 items-center justify-center rounded-full hover:bg-muted" aria-label="Forward 30 seconds">
          <RotateCw className="size-7" strokeWidth={1.6} />
          <span className="tabular absolute pt-0.5 font-mono text-[9px] font-medium">30</span>
        </button>
      </div>
    </>
  );
}

function SecondaryControls({ readAlong, onReadAlong, open }: { readAlong: boolean; onReadAlong: () => void; open: (s: SheetName) => void }) {
  const rate = usePlayer((s) => s.rate);
  const sleep = usePlayer((s) => s.sleep);
  const item = "press flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="mt-5 flex w-full gap-1">
      <button type="button" className={item} onClick={() => open("speed")} aria-label={`Speed ${rate}×`}>
        <span className="tabular font-mono text-sm text-foreground">{rate}×</span>Speed
      </button>
      <button type="button" className={item} onClick={() => open("chapters")}>
        <ListOrdered className="size-5 text-foreground" aria-hidden />
        Chapters
      </button>
      <button type="button" className={cn(item, "lg:hidden", readAlong && "text-foil")} onClick={onReadAlong} aria-pressed={readAlong}>
        <AlignLeft className={cn("size-5", readAlong ? "text-foil" : "text-foreground")} aria-hidden />
        Read along
      </button>
      <button type="button" className={item} onClick={() => open("bookmarks")}>
        <Bookmark className="size-5 text-foreground" aria-hidden />
        Bookmark
      </button>
      <button type="button" className={cn(item, sleep && "text-foil")} onClick={() => open("sleep")} aria-label={sleep ? "Sleep timer on" : "Sleep timer"}>
        <Moon className={cn("size-5", sleep ? "fill-current text-foil" : "text-foreground")} aria-hidden />
        Sleep
      </button>
    </div>
  );
}

function MoreMenu({ onVoice }: { onVoice: () => void }) {
  const store = usePlayerStore();
  const book = usePlayer((s) => s.book);
  const router = useRouter();
  async function remove() {
    if (!book || !store) return;
    if (!window.confirm(`Delete “${book.title}”? Its audio, bookmarks and progress are removed for good.`)) return;
    const res = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete the book. Try again.");
    await removeDownload(book.id).catch(() => {});
    localStorage.removeItem(`ab-progress:${book.id}`);
    store.close();
    toast.success(`Deleted ${book.title}`);
    router.push("/");
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button" className="-mr-2 flex size-11 items-center justify-center rounded-full hover:bg-muted" aria-label="More options">
            <Ellipsis className="size-5" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-72 p-1">
        <DropdownMenuItem onClick={() => setTimeout(onVoice, 150)} className="h-11 gap-3">
          <Mic aria-hidden /> Change voice
        </DropdownMenuItem>
        <div className="flex flex-col">
          <DownloadButton />
        </div>
        <DropdownMenuItem onClick={remove} className="h-11 gap-3 text-destructive">
          <Trash2 aria-hidden /> Delete book
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What the player is doing right now: making audio, waiting on approval, or an error with a way out. */
function StatusLine({ onSwitchVoice }: { onSwitchVoice: () => void }) {
  const store = usePlayerStore()!;
  const error = usePlayer((s) => s.error);
  const waiting = usePlayer((s) => s.waiting);
  const offline = usePlayer((s) => s.offline);
  const idx = usePlayer((s) => s.pos.chunkIdx);
  const chunks = usePlayer((s) => s.chunks);
  const approvalFor = usePlayer((s) => s.approvalFor);
  const book = usePlayer((s) => s.book)!;
  const finished = usePlayer((s) => s.finished);
  const ch = store.chapterOf(idx);
  const part = ch ? chunks.slice(ch.firstChunk, ch.lastChunk + 1) : [];
  const ready = part.filter((c) => c.status === "ready").length;
  const current = chunks[idx];
  const failedIdx = current?.status === "failed" ? idx : chunks.findIndex((c, i) => i > idx && c.status === "failed");

  if (offline)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <WifiOff className="size-4" aria-hidden /> Offline: playing downloaded chapters.
      </p>
    );
  if (finished) return <p className="text-center font-serif text-lg italic">The end. You finished {book.title}.</p>;
  if (error || failedIdx >= 0)
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
        <p className="flex gap-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <span>{error ?? chunks[failedIdx]?.error ?? "Some audio couldn't be made."}</span>
        </p>
        <div className="mt-3 flex gap-2">
          {failedIdx >= 0 && (
            <Button variant="outline" className="h-11" onClick={() => store.retry(failedIdx)}>
              Try again
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={onSwitchVoice}>
            Switch voice
          </Button>
        </div>
      </div>
    );
  if (approvalFor !== null)
    return <p className="text-center text-sm text-muted-foreground">Waiting for you to approve the next chapter&apos;s cost.</p>;
  if (waiting || current?.status === "generating" || (current && current.status !== "ready"))
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Making audio for this chapter… {ready} of {part.length} parts ready
      </p>
    );
  if (ready < part.length)
    return (
      <p className="text-center text-xs text-muted-foreground" role="status">
        Preparing the rest of this chapter in the background · {ready}/{part.length}
      </p>
    );
  return null;
}
