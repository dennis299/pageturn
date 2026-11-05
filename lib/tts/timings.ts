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
 * one (ElevenLabs); otherwise spreads the audio duration over sentences by character count.
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

  const weights = spans.map(({ s, e }) => text.slice(s, e).replace(/\s/g, "").length || 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return spans.map(({ s, e }, i) => {
    const t0 = t;
    t = i === spans.length - 1 ? durationSec : t + (durationSec * weights[i]) / total;
    return { s, e, t0: round(t0), t1: round(t) };
  });
}

const round = (x: number) => Math.round(x * 1000) / 1000;
