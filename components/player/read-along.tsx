"use client";
import { useEffect, useRef, useState } from "react";
import { sentenceAt } from "@/lib/player/sentence-at";
import { sentenceSpans } from "@/lib/tts/timings";
import { cn } from "@/lib/utils";
import { usePlayer, usePlayerStore } from "./player-provider";

/** The text of the part being read, with the spoken sentence highlighted. Tap a sentence to jump to it. */
export function ReadAlong({ className }: { className?: string }) {
  const store = usePlayerStore();
  const chunkIdx = usePlayer((s) => s.pos.chunkIdx);
  const offset = usePlayer((s) => s.pos.offsetSec);
  const chunk = usePlayer((s) => s.chunks[s.pos.chunkIdx]);
  const [loaded, setLoaded] = useState<{ idx: number; text: string | null } | null>(null);
  const text = loaded?.idx === chunkIdx ? loaded.text : null;
  const active = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let live = true;
    store?.getText(chunkIdx).then((t) => live && setLoaded({ idx: chunkIdx, text: t }));
    return () => {
      live = false;
    };
  }, [store, chunkIdx]);

  const timings = chunk?.timings ?? [];
  const current = sentenceAt(timings, offset);

  useEffect(() => {
    active.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [current, chunkIdx]);

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
