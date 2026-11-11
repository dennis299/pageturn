"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { SentenceTiming } from "@/lib/db/types";
import { sentenceAt } from "@/lib/player/sentence-at";
import type { ChapterMeta, ChunkMeta } from "@/lib/player/store";
import { estimateTimings, sentenceSpans } from "@/lib/tts/timings";
import { cn } from "@/lib/utils";
import { usePlayer, usePlayerStore } from "./player-provider";

/** After you scroll, the text stops following the voice for this long. */
const FOLLOW_PAUSE_MS = 8000;
/** Reading time is only counted while you've touched the page this recently. */
const READING_IDLE_MS = 90_000;

type Sentence = { n: number; chunkIdx: number; text: string; t0: number; chunkStart: boolean };
type Paragraph = { key: string; heading: boolean; sentences: Sentence[] };

/** When you last scrolled or touched the page by hand. Scrolling done by the app itself doesn't count. */
function useHandsClock() {
  const scrolledAt = useRef(0);
  const touchedAt = useRef(0);
  useEffect(() => {
    const scroll = () => (scrolledAt.current = touchedAt.current = Date.now());
    const touch = () => (touchedAt.current = Date.now());
    const onKey = (e: KeyboardEvent) => (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key) ? scroll() : touch());
    const opts = { passive: true, capture: true } as const;
    window.addEventListener("touchmove", scroll, opts);
    window.addEventListener("wheel", scroll, opts);
    window.addEventListener("keydown", onKey, opts);
    window.addEventListener("pointerdown", touch, opts);
    return () => {
      window.removeEventListener("touchmove", scroll, opts);
      window.removeEventListener("wheel", scroll, opts);
      window.removeEventListener("keydown", onKey, opts);
      window.removeEventListener("pointerdown", touch, opts);
    };
  }, []);
  return { scrolledAt, touchedAt };
}

/** When each sentence of a part is spoken: real timings from ElevenLabs, an estimate for other voices, none before the audio exists. */
function timingsFor(chunk: ChunkMeta | undefined, text: string): SentenceTiming[] {
  if (chunk?.status === "ready" && chunk.duration_sec) {
    if (chunk.provider === "elevenlabs" && chunk.timings?.length) return chunk.timings;
    return estimateTimings(text, chunk.duration_sec);
  }
  return sentenceSpans(text).map((s) => ({ ...s, t0: -1, t1: -1 }));
}

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Lays a chapter's parts out as paragraphs of sentences, keeping the book's own paragraph breaks. */
function layOut(chapter: ChapterMeta, texts: { idx: number; text: string }[], timings: Map<number, SentenceTiming[]>): Paragraph[] {
  const paras: Paragraph[] = [];
  let n = 0;
  for (const { idx, text } of texts) {
    const spans = timings.get(idx) ?? [];
    spans.forEach((sp, i) => {
      const sentence: Sentence = { n: n++, chunkIdx: idx, text: text.slice(sp.s, sp.e), t0: sp.t0, chunkStart: i === 0 };
      const last = paras[paras.length - 1];
      // Each chapter's first part opens with its title, spoken as a sentence: show it as the heading.
      if (!paras.length && idx === chapter.firstChunk && plain(sentence.text) === plain(chapter.title)) {
        paras.push({ key: `h${sentence.n}`, heading: true, sentences: [sentence] });
      } else if (!last || last.heading || (i > 0 && text.slice(spans[i - 1].e, sp.s).includes("\n"))) {
        paras.push({ key: `p${sentence.n}`, heading: false, sentences: [sentence] });
      } else {
        last.sentences.push(sentence);
      }
    });
  }
  return paras;
}

const ParagraphView = memo(function ParagraphView({
  para,
  active,
  heard,
  onTap,
}: {
  para: Paragraph;
  /** The sentence being spoken, if it is in this paragraph (else -1). */
  active: number;
  /** Everything here has already been spoken. */
  heard: boolean;
  onTap: (s: Sentence) => void;
}) {
  const Tag = para.heading ? "h2" : "p";
  return (
    <Tag className={cn(para.heading && "mb-5 font-serif text-[1.45em] leading-tight italic text-balance")}>
      {para.sentences.map((s) => (
        <span
          key={s.n}
          data-n={s.n}
          data-chunk-start={s.chunkStart ? s.chunkIdx : undefined}
          onClick={() => onTap(s)}
          className={cn("sentence scroll-mt-28", s.n === active ? "sentence-active" : (heard || (active >= 0 && s.n < active)) && "is-heard")}
        >
          {s.text}{" "}
        </span>
      ))}
    </Tag>
  );
});

/**
 * The chapter you're in, as a page to read. Read it in silence and your place follows what's on
 * screen; press play and the sentence being spoken is highlighted and kept in view. Tap a sentence
 * to move your place there.
 */
export function BookText({ className }: { className?: string }) {
  const store = usePlayerStore();
  const chunkIdx = usePlayer((s) => s.pos.chunkIdx);
  const chunks = usePlayer((s) => s.chunks);
  const chapters = usePlayer((s) => s.chapters);
  const playing = usePlayer((s) => s.playing);
  const offline = usePlayer((s) => s.offline);
  const chapter = store?.chapterOf(chunkIdx);
  const chapterIdx = chapter?.idx ?? -1;
  const [loaded, setLoaded] = useState<{ chapterIdx: number; texts: { idx: number; text: string }[] } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const { scrolledAt, touchedAt } = useHandsClock();
  /** The part this page last reported as your place, so that report doesn't scroll the page back. */
  const reported = useRef(-1);
  /** The chapter the page was last positioned for. */
  const placedChapter = useRef(-1);
  /** When the app itself last scrolled the page (to follow the voice, or to show your place). */
  const appScrolledAt = useRef(0);

  useEffect(() => {
    if (!store || !chapter) return;
    let live = true;
    store.getChapterTexts(chapter).then((texts) => live && setLoaded({ chapterIdx: chapter.idx, texts }));
    return () => {
      live = false;
    };
    // The chapter object is rebuilt on every state change; its index is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, chapterIdx]);

  const fresh = loaded?.chapterIdx === chapterIdx;
  const texts = fresh ? loaded.texts : null;

  const timings = useMemo(() => {
    const m = new Map<number, SentenceTiming[]>();
    for (const t of texts ?? []) m.set(t.idx, timingsFor(chunks[t.idx], t.text));
    return m;
  }, [texts, chunks]);
  const paras = useMemo(() => (chapter && texts ? layOut(chapter, texts, timings) : []), [chapter, texts, timings]);

  // The sentence at your place, once the voice has been there: -1 while you read in silence.
  const active = usePlayer(
    useCallback(
      (s) => {
        const t = timings.get(s.pos.chunkIdx);
        if (!t?.length || t[0].t0 < 0 || !(s.playing || s.pos.offsetSec > 0)) return -1;
        const i = sentenceAt(t, s.pos.offsetSec);
        if (i < 0) return -1;
        let before = 0;
        for (const [idx, list] of timings) if (idx < s.pos.chunkIdx) before += list.length;
        return before + i;
      },
      [timings],
    ),
  );

  // Follow the voice, but only when you're not scrolling yourself, and only when the sentence is
  // about to leave the comfortable middle of the screen, so the page never moves under your finger.
  useEffect(() => {
    if (active < 0 || !playing) return;
    if (Date.now() - scrolledAt.current < FOLLOW_PAUSE_MS) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-n="${active}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top >= vh * 0.18 && r.bottom <= vh * 0.66) return;
    appScrolledAt.current = Date.now();
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [active, playing, scrolledAt]);

  // Opening the page, or jumping somewhere (a chapter, a bookmark): show that place. Not when this
  // page itself moved your place because you scrolled.
  useEffect(() => {
    if (!paras.length) return;
    const newChapter = placedChapter.current !== chapterIdx;
    placedChapter.current = chapterIdx;
    if (reported.current === chunkIdx && !newChapter) return;
    reported.current = chunkIdx;
    // While the voice is reading, moving on to the next part is not a jump: following the voice
    // (above) keeps the sentence in view without yanking the page at every part.
    if (!newChapter && store?.getState().playing) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-chunk-start="${chunkIdx}"]`);
    if (!el) return;
    appScrolledAt.current = Date.now();
    if (chapter && chunkIdx === chapter.firstChunk) root.current?.closest(".app-scroll")?.scrollTo({ top: 0 });
    else el.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paras.length > 0, chapterIdx, chunkIdx]);

  // Reading in silence: your place is the part at the top third of the screen.
  useEffect(() => {
    const scroller = root.current?.closest<HTMLElement>(".app-scroll");
    if (!scroller || !store || !paras.length || !chapter) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const track = () => {
      timer = undefined;
      // Scrolls the app made itself don't move your place. Everything else is you, including the
      // glide after a flick, which carries on well after your finger has left the screen.
      if (Date.now() - appScrolledAt.current < 1200 || !scrolledAt.current) return;
      const s = store.getState();
      if (s.playing || s.waiting) return;
      const line = window.innerHeight * 0.32;
      let at = chapter.firstChunk;
      for (const el of root.current?.querySelectorAll<HTMLElement>("[data-chunk-start]") ?? []) {
        if (el.getBoundingClientRect().top <= line) at = Number(el.dataset.chunkStart);
        else break;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 48) at = chapter.lastChunk;
      reported.current = at;
      store.readTo(at);
      if (at === chunks.length - 1 && end.current && end.current.getBoundingClientRect().top < window.innerHeight) store.finishReading();
    };
    const onScroll = () => {
      if (!timer) timer = setTimeout(track, 220);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, paras.length > 0, chapterIdx, chunks.length, scrolledAt]);

  // Minutes spent reading count towards your day, like minutes listened.
  useEffect(() => {
    if (!store) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || store.getState().playing) return;
      if (Date.now() - touchedAt.current < READING_IDLE_MS) store.addReadingTime(15);
    }, 15_000);
    return () => clearInterval(id);
  }, [store, touchedAt]);

  const onTap = useCallback(
    (s: Sentence) => {
      // A tap that ends a text selection isn't a request to move.
      if (window.getSelection()?.toString()) return;
      reported.current = s.chunkIdx;
      store?.seekTo(s.chunkIdx, Math.max(0, s.t0));
    },
    [store],
  );

  if (!chapter) return null;
  if (!texts) return <div className={cn("h-64 animate-pulse rounded-3xl bg-muted/50", className)} role="status" aria-label="Opening the chapter" />;
  if (!texts.length)
    return (
      <p className={cn("text-muted-foreground", className)}>
        {offline ? "This chapter isn't downloaded, so it can't be shown without a connection." : "This chapter's text couldn't be loaded. Check your connection."}
      </p>
    );

  const next = chapters[chapter.idx + 1];
  return (
    <div ref={root} className={cn("reader font-serif", className)} lang="en">
      {paras.map((p) => {
        const first = p.sentences[0].n;
        const last = p.sentences[p.sentences.length - 1].n;
        const holds = active >= first && active <= last;
        return <ParagraphView key={p.key} para={p} active={holds ? active : -1} heard={active > last} onTap={onTap} />;
      })}
      <div ref={end} className="mt-10 flex flex-col items-start gap-3 font-sans text-base">
        {next ? (
          <button
            type="button"
            onClick={() => store?.jumpChapter(next.idx)}
            className="press glass flex min-h-12 max-w-full items-center gap-3 rounded-full py-2 pr-4 pl-5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Next chapter</span>
              <span className="block truncate font-medium">{next.title}</span>
            </span>
            <ArrowRight className="size-5 shrink-0" aria-hidden />
          </button>
        ) : (
          <p className="font-serif text-lg italic">The end.</p>
        )}
      </div>
    </div>
  );
}
