"use client";
import { useEffect, useRef, useState } from "react";
import { sentenceAt } from "@/lib/player/sentence-at";
import { sentenceSpans } from "@/lib/tts/timings";
import { cn } from "@/lib/utils";
import { usePlayer, usePlayerStore } from "./player-provider";

/** After you scroll, the text stops following the voice for this long. */
const FOLLOW_PAUSE_MS = 8000;

/** When you last scrolled by hand (touch, wheel or keys). Scrolling done by the page itself doesn't count. */
function useUserScrollClock() {
  const at = useRef(0);
  useEffect(() => {
    const mark = () => (at.current = Date.now());
    const onKey = (e: KeyboardEvent) => ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key) && mark();
    const opts = { passive: true, capture: true } as const;
    window.addEventListener("touchmove", mark, opts);
    window.addEventListener("wheel", mark, opts);
    window.addEventListener("keydown", onKey, opts);
    return () => {
      window.removeEventListener("touchmove", mark, opts);
      window.removeEventListener("wheel", mark, opts);
      window.removeEventListener("keydown", onKey, opts);
    };
  }, []);
  return at;
}

/** The text of the part being read, with the spoken sentence highlighted. Tap a sentence to jump to it. */
export function ReadAlong({ className }: { className?: string }) {
  const store = usePlayerStore();
  const chunkIdx = usePlayer((s) => s.pos.chunkIdx);
  const offset = usePlayer((s) => s.pos.offsetSec);
  const chunk = usePlayer((s) => s.chunks[s.pos.chunkIdx]);
  const [loaded, setLoaded] = useState<{ idx: number; text: string | null } | null>(null);
  // While the next part's text loads, keep showing the last one, so the page doesn't collapse and jump.
  const fresh = loaded?.idx === chunkIdx;
  const text = loaded?.text ?? null;
  const active = useRef<HTMLSpanElement>(null);
  const userScrolledAt = useUserScrollClock();

  useEffect(() => {
    let live = true;
    store?.getText(chunkIdx).then((t) => live && setLoaded({ idx: chunkIdx, text: t }));
    return () => {
      live = false;
    };
  }, [store, chunkIdx]);

  const timings = fresh ? (chunk?.timings ?? []) : [];
  const current = fresh ? sentenceAt(timings, offset) : -1;

  useEffect(() => {
    const el = active.current;
    if (!el) return;
    // Follow the voice only when you're not scrolling yourself, and only when the sentence is about
    // to leave the comfortable middle of the screen, so the page never moves under your finger.
    if (Date.now() - userScrolledAt.current < FOLLOW_PAUSE_MS) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top >= vh * 0.2 && r.bottom <= vh * 0.7) return;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [current, chunkIdx, userScrolledAt]);

  if (text === null) return <div className={cn("h-40 animate-pulse rounded-xl bg-muted/50", className)} />;

  const spans = timings.length ? timings : sentenceSpans(text).map((s) => ({ ...s, t0: -1, t1: -1 }));
  return (
    <div className={cn("font-serif text-[1.2rem] leading-[1.75] sm:text-[1.3rem]", className)} lang="en">
      {spans.map((s, i) => (
        <span
          key={i}
          ref={i === current ? active : undefined}
          role={s.t0 >= 0 ? "button" : undefined}
          tabIndex={s.t0 >= 0 ? 0 : undefined}
          onClick={() => s.t0 >= 0 && store?.seekTo(chunkIdx, s.t0)}
          onKeyDown={(e) => e.key === "Enter" && s.t0 >= 0 && store?.seekTo(chunkIdx, s.t0)}
          className={cn(
            "cursor-pointer transition-colors duration-200",
            i === current ? "sentence-active text-foreground" : i < current ? "text-muted-foreground" : "text-foreground/80",
          )}
        >
          {text.slice(s.s, s.e)}{" "}
        </span>
      ))}
    </div>
  );
}
