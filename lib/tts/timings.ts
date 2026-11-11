import type { SentenceTiming } from "@/lib/db/types";
import type { Alignment } from "./types";

/** Sentence spans of `text` (character offsets, trailing whitespace excluded). */
export function sentenceSpans(text: string): { s: number; e: number }[] {
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  const spans: { s: number; e: number }[] = [];
  for (const part of seg.segment(text)) {
    const trimmed = part.segment.replace(/\s+$/, "");
    const lead = trimmed.length - trimmed.trimStart().length;
    if (!trimmed.trim()) continue;
    spans.push({ s: part.index + lead, e: part.index + trimmed.length });
  }
  return spans;
}

/**
 * When each sentence of a chunk is spoken. Uses per-character alignment when the provider gives
 * one (ElevenLabs); otherwise estimates them from each sentence's length and pauses.
 */
export function sentenceTimings(text: string, durationSec: number, alignment?: Alignment): SentenceTiming[] {
  const spans = sentenceSpans(text);
  if (!spans.length) return [];

  if (alignment && alignment.chars.length === text.length && alignment.start.length === text.length) {
    return spans.map(({ s, e }) => ({
      s,
      e,
      t0: round(alignment.start[s]),
      t1: round(alignment.end[e - 1]),
    }));
  }

  return spread(text, spans, durationSec);
}

/**
 * How long a sentence takes to say, in "characters": its letters, plus the breath after it and the
 * small pauses at commas, plus digits (a number is longer spoken than written). The weights were
 * fitted to parts with real timings: they put the highlight about 0.8 s from the voice on average,
 * against about 1 s when only letters are counted.
 */
function speechWeight(sentence: string, isLast: boolean): number {
  const letters = sentence.replace(/\s/g, "").length || 1;
  const digits = sentence.replace(/[^0-9]/g, "").length;
  const pauses = sentence.replace(/[^,;:–—]/g, "").length;
  return letters + 2 * digits + 2 * pauses + (isLast ? 0 : 8);
}

function spread(text: string, spans: { s: number; e: number }[], durationSec: number): SentenceTiming[] {
  const weights = spans.map(({ s, e }, i) => speechWeight(text.slice(s, e), i === spans.length - 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return spans.map(({ s, e }, i) => {
    const t0 = t;
    t = i === spans.length - 1 ? durationSec : t + (durationSec * weights[i]) / total;
    return { s, e, t0: round(t0), t1: round(t) };
  });
}

/** Estimated sentence timings for a voice that doesn't report them (every voice but ElevenLabs). */
export function estimateTimings(text: string, durationSec: number): SentenceTiming[] {
  const spans = sentenceSpans(text);
  return spans.length ? spread(text, spans, durationSec) : [];
}

const round = (x: number) => Math.round(x * 1000) / 1000;
