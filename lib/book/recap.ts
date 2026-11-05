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

/** Offer a "previously on…" recap when you've been away for over a day and aren't at the start. */
export function shouldOfferRecap(posIdx: number, lastListenedAt: string | null, now = Date.now()): boolean {
  if (posIdx <= 0 || !lastListenedAt) return false;
  return now - Date.parse(lastListenedAt) > 24 * 3600_000;
}
