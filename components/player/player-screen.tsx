"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ALargeSmall,
  Bookmark,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  ListOrdered,
  Loader2,
  Mic,
  Moon,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
  WifiOff,
} from "lucide-react";
import { BookCover } from "@/components/book-cover";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatClock } from "@/lib/book/progress-math";
import { bookTint, coverSrc } from "@/lib/cover";
import { removeDownload } from "@/lib/offline/books";
import { cn } from "@/lib/utils";
import { BookText } from "./book-text";
import { DownloadButton } from "./download-button";
import { EditBookSheet } from "./edit-book-sheet";
import { usePlayer, usePlayerStore } from "./player-provider";
import { RecapCard } from "./recap-card";
import { ApprovalSheet, BookmarksSheet, BottomSheet, ChaptersSheet, SleepSheet, SpeedSheet } from "./sheets";
import { VoiceSheet } from "./voice-sheet";

type SheetName = "chapters" | "speed" | "sleep" | "bookmarks" | "voice" | "edit" | "text" | null;
type View = "listen" | "read";

/** Reading text sizes, in rem. */
const SIZES = [1, 1.1, 1.2, 1.32, 1.46, 1.62];
const DEFAULT_SIZE = 2;

const WIDE = "(min-width: 1024px)";
/** A screen wide enough to show the player and the page side by side. */
function useWide(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store_(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function PlayerScreen({ bookId }: { bookId: string }) {
  const store = usePlayerStore();
  const book = usePlayer((s) => s.book);
  const error = usePlayer((s) => s.error);
  const wide = useWide();
  const [sheet, setSheet] = useState<SheetName>(null);
  // "ab-read-along" is where older versions remembered that you had the text open.
  const [view, setViewState] = useState<View>(() => (stored("ab-view") === "read" || (stored("ab-view") === null && stored("ab-read-along") === "1") ? "read" : "listen"));
  const [size, setSizeState] = useState(() => {
    const n = Number(stored("ab-text-size"));
    return stored("ab-text-size") !== null && Number.isInteger(n) && n >= 0 && n < SIZES.length ? n : DEFAULT_SIZE;
  });
  const setView = (v: View) => {
    setViewState(v);
    store_("ab-view", v);
  };
  const setSize = (n: number) => {
    setSizeState(n);
    store_("ab-text-size", String(n));
  };
  /** Only the page is showing: no audio is made until you press play. */
  const reading = !wide && view === "read";

  useEffect(() => {
    void store?.open(bookId, { quiet: reading });
    // Whether to stay quiet is only decided when the book opens; the effect below follows the switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, bookId]);

  useEffect(() => {
    if (reading) store?.readQuietly();
    else store?.wantAudio();
  }, [store, reading]);

  // On a phone the book's colour runs up behind the clock while you listen.
  const tint = book ? bookTint(book) : null;
  const flooded = Boolean(tint) && !wide && view === "listen";
  useEffect(() => {
    if (!flooded || !tint) return;
    const root = document.documentElement;
    root.style.setProperty("--scrim", `color-mix(in oklab, ${tint} 88%, black)`);
    return () => {
      root.style.removeProperty("--scrim");
    };
  }, [flooded, tint]);

  if (!store || !book || book.id !== bookId) {
    return (
      <div className="min-h-app flex items-center justify-center p-8 text-muted-foreground" role="status">
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

  const open = (s: SheetName) => setSheet(s);
  const bar = <TopBar view={view} onView={setView} showSwitch={!wide} open={open} pinned={reading} />;
  return (
    <div
      className="relative mx-auto w-full max-w-6xl lg:grid lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start lg:gap-12 lg:px-8 lg:py-8"
      style={{ ["--book" as string]: tint, ["--reader-size" as string]: `${SIZES[size]}rem` }}
    >
      {(wide || view === "listen") && <ListenPanel bar={bar} open={open} />}
      {(wide || view === "read") && (
        <section aria-label="The page" className="relative min-w-0 px-5 pb-4 sm:px-8 lg:px-0 lg:pb-16">
          {!wide && <div className="book-wash-soft" aria-hidden />}
          <div className="relative z-10">
            {wide ? (
              <div className="flex justify-end">
                <button type="button" onClick={() => open("text")} className="glass glass-btn flex h-10 items-center gap-2 rounded-full px-4 text-sm">
                  <ALargeSmall className="size-5" aria-hidden /> Text size
                </button>
              </div>
            ) : (
              bar
            )}
            <BookText className="mx-auto mt-5 max-w-[34em]" />
            {!wide && <ReaderDock open={open} />}
          </div>
        </section>
      )}

      <ChaptersSheet open={sheet === "chapters"} onOpenChange={(o) => setSheet(o ? "chapters" : null)} />
      <SpeedSheet open={sheet === "speed"} onOpenChange={(o) => setSheet(o ? "speed" : null)} />
      <SleepSheet open={sheet === "sleep"} onOpenChange={(o) => setSheet(o ? "sleep" : null)} />
      <BookmarksSheet bookId={book.id} open={sheet === "bookmarks"} onOpenChange={(o) => setSheet(o ? "bookmarks" : null)} />
      <VoiceSheet open={sheet === "voice"} onOpenChange={(o) => setSheet(o ? "voice" : null)} />
      <EditBookSheet open={sheet === "edit"} onOpenChange={(o) => setSheet(o ? "edit" : null)} />
      <TextSizeSheet open={sheet === "text"} onOpenChange={(o) => setSheet(o ? "text" : null)} size={size} onSize={setSize} />
      <ApprovalSheet />
    </div>
  );
}

/** Back, the Listen / Read switch, and the menu. */
function TopBar({
  view,
  onView,
  showSwitch,
  open,
  pinned = false,
}: {
  view: View;
  onView: (v: View) => void;
  showSwitch: boolean;
  open: (s: SheetName) => void;
  /** Stays at the top while the page scrolls under it (the reading view). */
  pinned?: boolean;
}) {
  const round = cn("glass-btn flex size-10 shrink-0 items-center justify-center rounded-full", pinned ? "glass" : "glass-thin");
  return (
    <header className={cn("flex h-14 items-center justify-between gap-3", pinned && "top-bar-pinned")}>
      <Link href="/" className={round} aria-label="Back to your shelf">
        <ChevronDown className="size-5 lg:rotate-90" aria-hidden />
      </Link>
      {showSwitch && (
        <div className={cn("segmented", pinned ? "glass" : "glass-thin")} role="group" aria-label="Listen or read">
          <button type="button" aria-pressed={view === "listen"} onClick={() => onView("listen")}>
            Listen
          </button>
          <button type="button" aria-pressed={view === "read"} onClick={() => onView("read")}>
            Read
          </button>
        </div>
      )}
      <MoreMenu open={open} className={round} />
    </header>
  );
}

/** The listening view: the cover in its own light, and the controls on glass. Always dark, like a cinema. */
function ListenPanel({ bar, open }: { bar: React.ReactNode; open: (s: SheetName) => void }) {
  const store = usePlayerStore()!;
  const book = usePlayer((s) => s.book)!;
  const idx = usePlayer((s) => s.pos.chunkIdx);
  const ch = store.chapterOf(idx);
  const src = coverSrc(book);
  return (
    <section
      aria-label="Now playing"
      className="dark player-panel flex min-h-dvh flex-col px-6 text-foreground lg:sticky lg:top-8 lg:min-h-0 lg:overflow-hidden lg:rounded-[2rem] lg:px-7 lg:pt-3 lg:pb-7"
    >
      <div className="book-wash" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- the cover again, blurred into light */}
        {src && <img src={src} alt="" />}
      </div>
      <div className="relative z-10 flex flex-1 flex-col">
        {bar}
        <div className="flex flex-1 items-center justify-center py-5">
          <BookCover id={book.id} title={book.title} author={book.author} coverPath={book.cover_path} size="lg" className="w-[min(56vw,15rem)] sm:w-56 lg:w-52" />
        </div>
        <div className="min-w-0">
          <h1 className="line-clamp-2 font-serif text-[1.6rem] leading-[1.15] text-balance">{book.title}</h1>
          <p className="mt-1.5 truncate text-[15px] text-foreground/70">{ch?.title ?? book.author}</p>
        </div>
        <Scrubber />
        <Transport />
        <Controls open={open} />
        <div className="mt-4 flex flex-col gap-3 empty:hidden">
          <StatusLine onSwitchVoice={() => open("voice")} />
          <RecapCard />
        </div>
      </div>
    </section>
  );
}

function Scrubber() {
  const store = usePlayerStore()!;
  usePlayer((s) => s.pos.offsetSec);
  usePlayer((s) => s.chunks);
  const count = usePlayer((s) => s.chapters.length);
  const { t, total, chapter } = store.chapterTime();
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? t;
  const pct = total ? (shown / total) * 100 : 0;
  const commit = () => {
    if (drag !== null) store.seekChapterTime(drag);
    setDrag(null);
  };
  return (
    <div className="mt-5 w-full">
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(total))}
        step={1}
        value={Math.floor(shown)}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Position in chapter"
        aria-valuetext={`${formatClock(shown)} of ${formatClock(total)}`}
        className="scrubber h-9 w-full cursor-pointer appearance-none bg-transparent"
        style={{ ["--pct" as string]: `${pct}%` }}
      />
      <div className="tabular flex items-center justify-between text-xs text-foreground/65">
        <span>{formatClock(shown)}</span>
        <span>
          Chapter {(chapter?.idx ?? 0) + 1} of {count}
        </span>
        <span>-{formatClock(Math.max(0, total - shown))}</span>
      </div>
    </div>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  const playing = usePlayer((s) => s.playing);
  const waiting = usePlayer((s) => s.waiting);
  if (waiting) return <Loader2 className={cn("animate-spin", className)} aria-hidden />;
  return playing ? <Pause className={cn("fill-current", className)} aria-hidden /> : <Play className={cn("translate-x-0.5 fill-current", className)} aria-hidden />;
}

function Transport() {
  const store = usePlayerStore()!;
  const playing = usePlayer((s) => s.playing);
  const waiting = usePlayer((s) => s.waiting);
  const skip = "glass-btn relative flex size-14 items-center justify-center rounded-full";
  return (
    <div className="mt-3 flex items-center justify-center gap-7 sm:gap-10">
      <button type="button" onClick={() => store.seekBy(-15)} className={skip} aria-label="Back 15 seconds">
        <RotateCcw className="size-8" strokeWidth={1.5} aria-hidden />
        <span className="tabular absolute pt-0.5 text-[9px] font-semibold">15</span>
      </button>
      <button type="button" onClick={() => store.toggle()} className="play-btn flex size-[4.75rem] items-center justify-center rounded-full" aria-label={playing || waiting ? "Pause" : "Play"}>
        <PlayGlyph className="size-8" />
      </button>
      <button type="button" onClick={() => store.seekBy(30)} className={skip} aria-label="Forward 30 seconds">
        <RotateCw className="size-8" strokeWidth={1.5} aria-hidden />
        <span className="tabular absolute pt-0.5 text-[9px] font-semibold">30</span>
      </button>
    </div>
  );
}

/** Speed, chapters, bookmarks, sleep timer and voice, on one strip of glass. */
function Controls({ open }: { open: (s: SheetName) => void }) {
  const rate = usePlayer((s) => s.rate);
  const sleep = usePlayer((s) => s.sleep);
  const voice = usePlayer((s) => s.book?.voice_name ?? "Voice");
  const item = "glass-btn flex min-h-[3.4rem] min-w-0 flex-col items-center justify-center gap-1 rounded-[1.3rem] px-1 text-[11px] text-foreground/75";
  const icon = "size-[1.3rem] text-foreground";
  return (
    <div className="glass-thin mt-6 grid grid-cols-5 rounded-[1.7rem] p-1.5">
      <button type="button" className={item} onClick={() => open("speed")} aria-label={`Speed ${rate}×`}>
        <span className="tabular flex h-[1.3rem] items-center text-[15px] font-semibold text-foreground">{rate}×</span>
        Speed
      </button>
      <button type="button" className={item} onClick={() => open("chapters")}>
        <ListOrdered className={icon} aria-hidden />
        Chapters
      </button>
      <button type="button" className={item} onClick={() => open("bookmarks")}>
        <Bookmark className={icon} aria-hidden />
        Bookmark
      </button>
      <button type="button" className={cn(item, sleep && "text-foil")} onClick={() => open("sleep")} aria-label={sleep ? "Sleep timer on" : "Sleep timer"}>
        <Moon className={cn(icon, sleep && "fill-current text-foil")} aria-hidden />
        Sleep
      </button>
      <button type="button" className={item} onClick={() => open("voice")} aria-label={`Voice: ${voice}. Change voice`}>
        <Mic className={icon} aria-hidden />
        <span className="max-w-full truncate">{voice}</span>
      </button>
    </div>
  );
}

/** The strip at the foot of the page: where you are in the chapter, text size, chapters, and play. */
function ReaderDock({ open }: { open: (s: SheetName) => void }) {
  const store = usePlayerStore()!;
  const book = usePlayer((s) => s.book)!;
  const idx = usePlayer((s) => s.pos.chunkIdx);
  const playing = usePlayer((s) => s.playing);
  const waiting = usePlayer((s) => s.waiting);
  const ch = store.chapterOf(idx);
  const through = ch ? (idx - ch.firstChunk + 1) / (ch.lastChunk - ch.firstChunk + 1) : 0;
  const round = "glass-btn flex size-11 shrink-0 items-center justify-center rounded-full";
  return (
    <div className="reader-dock mt-10 flex flex-col gap-2">
      <StatusLine onSwitchVoice={() => open("voice")} urgentOnly />
      <div className="glass flex items-center gap-1 rounded-full p-1.5 pl-2.5">
        <BookCover id={book.id} title={book.title} coverPath={book.cover_path} size="sm" className="w-8 rounded-[2px_5px_5px_2px]" />
        <div className="min-w-0 flex-1 px-2">
          <p className="truncate text-[13px] font-medium">{ch?.title ?? book.title}</p>
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-foreground/15" role="presentation">
            <div className="h-full rounded-full bg-foreground/70 transition-[width] duration-300" style={{ width: `${Math.round(through * 100)}%` }} />
          </div>
        </div>
        <button type="button" className={round} onClick={() => open("text")} aria-label="Text size">
          <ALargeSmall className="size-[1.35rem]" aria-hidden />
        </button>
        <button type="button" className={round} onClick={() => open("chapters")} aria-label="Chapters">
          <ListOrdered className="size-[1.25rem]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => store.toggle()}
          className="play-btn flex size-11 shrink-0 items-center justify-center rounded-full"
          aria-label={playing || waiting ? "Pause" : "Read it to me from here"}
        >
          <PlayGlyph className="size-5" />
        </button>
      </div>
    </div>
  );
}

function TextSizeSheet({ open, onOpenChange, size, onSize }: { open: boolean; onOpenChange: (o: boolean) => void; size: number; onSize: (n: number) => void }) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Text size">
      <div className="grid grid-cols-6 gap-2 pt-1" role="group" aria-label="Text size">
        {SIZES.map((rem, i) => (
          <button
            key={rem}
            type="button"
            aria-pressed={i === size}
            aria-label={`Size ${i + 1} of ${SIZES.length}`}
            onClick={() => onSize(i)}
            className={cn("press flex h-16 items-center justify-center rounded-2xl border font-serif", i === size ? "border-foil bg-accent/60" : "border-border")}
            style={{ fontSize: `${rem * 1.15}rem` }}
          >
            A
          </button>
        ))}
      </div>
      <p className="reader mt-5 font-serif text-foreground/85" style={{ fontSize: `${SIZES[size]}rem` }}>
        Every evening at a quarter past six, Ada climbed the iron ladder and lit the last gas lamp in the city.
      </p>
    </BottomSheet>
  );
}

function MoreMenu({ open, className }: { open: (s: SheetName) => void; className: string }) {
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
  // The menu closes first; a sheet opened in the same tick would lose focus to it.
  const later = (s: SheetName) => () => setTimeout(() => open(s), 150);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button" className={className} aria-label="More options">
            <Ellipsis className="size-5" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-72 p-1">
        <DropdownMenuItem onClick={later("edit")} className="h-11 gap-3">
          <Pencil aria-hidden /> Book details and cover
        </DropdownMenuItem>
        <DropdownMenuItem onClick={later("voice")} className="h-11 gap-3">
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

/**
 * What the player is doing right now: making audio, waiting on approval, or an error with a way
 * out. `urgentOnly` (under the page you read) keeps quiet unless something needs you.
 */
function StatusLine({ onSwitchVoice, urgentOnly = false }: { onSwitchVoice: () => void; urgentOnly?: boolean }) {
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
  const note = cn("text-sm text-foreground/70", urgentOnly && "glass rounded-2xl px-4 py-2.5 text-foreground");

  if (offline && !urgentOnly)
    return (
      <p className={cn(note, "flex items-center justify-center gap-2")}>
        <WifiOff className="size-4" aria-hidden /> Offline: playing downloaded chapters.
      </p>
    );
  if (finished && !urgentOnly) return <p className="text-center font-serif text-lg italic">The end. You finished {book.title}.</p>;
  if (error || (failedIdx >= 0 && !urgentOnly) || (failedIdx === idx && waiting))
    return (
      <div className={cn("rounded-2xl border border-destructive/40 bg-destructive/15 p-3 text-sm", urgentOnly && "glass")} role="alert">
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
  if (approvalFor !== null) return <p className={cn(note, "text-center")}>Waiting for you to approve the next chapter&apos;s cost.</p>;
  if (waiting || (!urgentOnly && current && current.status !== "ready"))
    return (
      <p className={cn(note, "flex items-center justify-center gap-2")} role="status">
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> Making the audio for this chapter: {ready} of {part.length} parts ready
      </p>
    );
  if (ready < part.length && !urgentOnly)
    return (
      <p className="text-center text-xs text-foreground/60" role="status">
        Preparing the rest of this chapter in the background ({ready} of {part.length})
      </p>
    );
  return null;
}
