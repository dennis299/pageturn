"use client";
import { useCallback, useEffect, useState } from "react";
import { Bookmark, Check, CircleAlert, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { BookmarkRow } from "@/lib/db/types";
import { formatClock, formatDuration } from "@/lib/book/progress-math";
import { RATES } from "@/lib/player/store";
import { sentenceAt } from "@/lib/player/sentence-at";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { usePlayer, usePlayerStore } from "./player-provider";

type SheetProps = { open: boolean; onOpenChange: (o: boolean) => void };

function BottomSheet({ open, onOpenChange, title, description, children }: SheetProps & { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="pb-safe mx-auto max-h-[85dvh] max-w-xl rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl font-normal">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function ChaptersSheet(p: SheetProps) {
  const store = usePlayerStore();
  const chapters = usePlayer((s) => s.chapters);
  const chunks = usePlayer((s) => s.chunks);
  const pos = usePlayer((s) => s.pos.chunkIdx);
  return (
    <BottomSheet {...p} title="Chapters">
      <ol className="flex flex-col">
        {chapters.map((c) => {
          const part = chunks.slice(c.firstChunk, c.lastChunk + 1);
          const ready = part.filter((x) => x.status === "ready").length;
          const failed = part.some((x) => x.status === "failed");
          const here = pos >= c.firstChunk && pos <= c.lastChunk;
          const done = pos > c.lastChunk;
          return (
            <li key={c.idx}>
              <button
                type="button"
                onClick={() => {
                  store?.jumpChapter(c.idx);
                  p.onOpenChange(false);
                }}
                className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-accent/40", here && "bg-accent/50")}
                aria-current={here ? "true" : undefined}
              >
                <span className="tabular w-7 shrink-0 font-mono text-xs text-muted-foreground">{c.idx + 1}</span>
                <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground")}>{c.title}</span>
                <span className="tabular shrink-0 font-mono text-[11px] text-muted-foreground">
                  {failed ? (
                    <CircleAlert className="size-4 text-destructive" aria-label="Some audio failed" />
                  ) : ready === part.length ? (
                    formatDuration(part.reduce((s, x) => s + (x.duration_sec ?? 0), 0))
                  ) : ready > 0 ? (
                    `${Math.round((ready / part.length) * 100)}% ready`
                  ) : (
                    formatDuration(c.charCount / 15)
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </BottomSheet>
  );
}

export function SpeedSheet(p: SheetProps) {
  const store = usePlayerStore();
  const rate = usePlayer((s) => s.rate);
  return (
    <BottomSheet {...p} title="Speed">
      <div className="grid grid-cols-3 gap-2">
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              store?.setRate(r);
              p.onOpenChange(false);
            }}
            className={cn("tabular h-12 rounded-lg border font-mono text-sm", r === rate ? "border-foil bg-accent/50" : "border-border")}
            aria-pressed={r === rate}
          >
            {r}×
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export function SleepSheet(p: SheetProps) {
  const store = usePlayerStore();
  const sleep = usePlayer((s) => s.sleep);
  const opts: { label: string; v: number | "chapter" | null }[] = [
    { label: "15 minutes", v: 15 },
    { label: "30 minutes", v: 30 },
    { label: "45 minutes", v: 45 },
    { label: "1 hour", v: 60 },
    { label: "End of chapter", v: "chapter" },
    { label: "Off", v: null },
  ];
  const endsAt = sleep && "endsAt" in sleep ? new Date(sleep.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <BottomSheet {...p} title="Sleep timer" description={endsAt ? `Stops at ${endsAt}` : sleep ? "Stops at the end of this chapter" : undefined}>
      <div className="flex flex-col">
        {opts.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => {
              store?.setSleep(o.v);
              p.onOpenChange(false);
            }}
            className="flex min-h-12 items-center rounded-lg px-2 text-left hover:bg-accent/40"
          >
            {o.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export function BookmarksSheet(p: SheetProps & { bookId: string }) {
  const store = usePlayerStore();
  const [items, setItems] = useState<BookmarkRow[] | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const chapters = usePlayer((s) => s.chapters);

  const load = useCallback(
    () =>
      createClient()
        .from("ab_bookmarks")
        .select("*")
        .eq("book_id", p.bookId)
        .order("chunk_idx")
        .order("offset_sec")
        .then(({ data }) => setItems((data ?? []) as BookmarkRow[])),
    [p.bookId],
  );

  useEffect(() => {
    if (!p.open) return;
    createClient()
      .from("ab_bookmarks")
      .select("*")
      .eq("book_id", p.bookId)
      .order("chunk_idx")
      .order("offset_sec")
      .then(({ data }) => setItems((data ?? []) as BookmarkRow[]));
  }, [p.open, p.bookId]);

  async function add() {
    if (!store) return;
    setSaving(true);
    const { pos, chunks } = store.getState();
    const text = await store.getText(pos.chunkIdx);
    const timings = chunks[pos.chunkIdx]?.timings ?? [];
    const i = sentenceAt(timings, pos.offsetSec);
    const quote = text && i >= 0 ? text.slice(timings[i].s, timings[i].e) : text?.slice(0, 200) ?? null;
    const { error } = await createClient()
      .from("ab_bookmarks")
      .insert({ book_id: p.bookId, chunk_idx: pos.chunkIdx, offset_sec: Math.max(0, (timings[i]?.t0 ?? pos.offsetSec) - 0.2), quote, note: note.trim() || null });
    setSaving(false);
    if (error) return toast.error("Couldn't save the bookmark.");
    setNote("");
    toast.success("Bookmarked");
    void load();
  }

  async function remove(id: string) {
    await createClient().from("ab_bookmarks").delete().eq("id", id);
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? null);
  }

  return (
    <BottomSheet {...p} title="Bookmarks" description="Saves the sentence you're hearing, with an optional note.">
      <div className="flex flex-col gap-2">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" className="min-h-20 text-base" aria-label="Bookmark note" />
        <Button onClick={add} disabled={saving} className="h-12 text-base">
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Bookmark aria-hidden />} Bookmark this moment
        </Button>
      </div>
      <ul className="mt-5 flex flex-col divide-y divide-border">
        {items === null && <li className="py-4 text-sm text-muted-foreground">Loading…</li>}
        {items?.length === 0 && <li className="py-4 text-sm text-muted-foreground">No bookmarks yet.</li>}
        {items?.map((b) => {
          const ch = chapters.find((c) => b.chunk_idx >= c.firstChunk && b.chunk_idx <= c.lastChunk);
          return (
            <li key={b.id} className="flex gap-2 py-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  store?.seekTo(b.chunk_idx, b.offset_sec);
                  p.onOpenChange(false);
                }}
              >
                <span className="block text-xs text-muted-foreground italic">{ch?.title}</span>
                {b.quote && <span className="mt-1 line-clamp-3 block border-l-2 border-ribbon pl-3 font-serif">{b.quote}</span>}
                {b.note && <span className="mt-1 block text-sm">{b.note}</span>}
              </button>
              <Button variant="ghost" size="icon-lg" className="size-11 shrink-0" onClick={() => remove(b.id)} aria-label="Delete bookmark">
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}

/** Shown before a paid voice makes a chapter's audio. */
export function ApprovalSheet() {
  const store = usePlayerStore();
  const ci = usePlayer((s) => s.approvalFor);
  const credits = usePlayer((s) => s.credits);
  const book = usePlayer((s) => s.book);
  const chapter = ci !== null ? store?.getState().chapters[ci] : undefined;
  if (!store || !book || !chapter) return null;
  const cost = store.chapterCost(chapter);
  const isEleven = book.voice_provider === "elevenlabs";
  return (
    <BottomSheet
      open
      onOpenChange={(o) => !o && store.declineApproval()}
      title={`Make audio for “${chapter.title}”?`}
      description={`${book.voice_name} is a paid voice. This chapter costs ${cost.label}.`}
    >
      {isEleven && credits !== null && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm">
          <span className="tabular font-mono">{credits.toLocaleString("en-US")}</span> ElevenLabs credits left this month, shared with YouTube.
          {cost.amount > credits && <span className="mt-1 block text-destructive">That&apos;s more than you have left. Switch to a free voice instead.</span>}
        </p>
      )}
      <label className="mt-4 flex min-h-12 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-[var(--foil)]"
          checked={book.auto_continue}
          onChange={(e) => store.setAutoContinue(e.target.checked)}
        />
        Keep going automatically for the next chapters (asks again if one would use more than 10% of what&apos;s left)
      </label>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" onClick={() => store.declineApproval()}>
          Not now
        </Button>
        {isEleven && credits !== null && cost.amount > credits ? (
          <Button
            className="h-12"
            onClick={() =>
              store.switchVoice({ provider: "openrouter", voiceId: "nadine", voiceName: "Nadine", model: "heygen/heygen-voice-1-turbo:free" })
            }
          >
            Use the free voice
          </Button>
        ) : (
          <Button className="h-12" onClick={() => store.approve(chapter.idx)}>
            <Check aria-hidden /> Make it
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

export function formatClockPair(t: number, total: number) {
  return { elapsed: formatClock(t), remaining: `-${formatClock(Math.max(0, total - t))}` };
}
