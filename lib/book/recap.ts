import { dayKey } from "@/lib/stats/streak";

/** The text you've already heard, most recent last, capped at `maxChars` (keeps the newest part). */
export function recapSource(chunks: { idx: number; text: string }[], posIdx: number, maxChars = 4000): string {
  const before = chunks.filter((c) => c.idx < posIdx).sort((a, b) => a.idx - b.idx);
  let out = "";
  for (let i = before.length - 1; i >= 0; i--) {
    const next = out ? `${before[i].text}\n${out}` : before[i].text;
    if (next.length > maxChars) break;
    out = next;
  }
  if (!out && before.length) out = before[before.length - 1].text.slice(-maxChars);
  return out;
}

/**
 * Offer a "previously on…" recap on the first listen of each new calendar day (in your time zone),
 * once something has been heard and today's recap hasn't been played yet.
 */
export function shouldOfferRecap(i: {
  posIdx: number;
  lastListenedAt: string | null;
  now?: number;
  timeZone?: string;
  /** YYYY-MM-DD of the day a recap was last heard for this book. */
  recapHeardOn?: string | null;
}): boolean {
  if (i.posIdx <= 0 || !i.lastListenedAt) return false;
  const tz = i.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayKey(new Date(i.now ?? Date.now()), tz);
  if (i.recapHeardOn === today) return false;
  return dayKey(new Date(i.lastListenedAt), tz) !== today;
}
