/** YYYY-MM-DD for a moment, in a time zone. */
export function dayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function shift(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/** The last `n` day keys ending at `today`, oldest first. */
export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shift(today, i - n + 1));
}

/** Minutes listened per local day. */
export function minutesByDay(sessions: { started_at: string; seconds: number }[], timeZone: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    const k = dayKey(new Date(s.started_at), timeZone);
    out.set(k, (out.get(k) ?? 0) + s.seconds / 60);
  }
  for (const [k, v] of out) out.set(k, Math.round(v * 10) / 10);
  return out;
}

/** Days in a row you met your goal, ending today (or yesterday, if today isn't done yet). */
export function currentStreak(byDay: Map<string, number>, goalMin: number, today: string): number {
  const met = (d: string) => (byDay.get(d) ?? 0) >= goalMin;
  let day = met(today) ? today : shift(today, -1);
  let n = 0;
  while (met(day)) {
    n++;
    day = shift(day, -1);
  }
  return n;
}

/** Longest run of goal-meeting days in the data. */
export function bestStreak(byDay: Map<string, number>, goalMin: number): number {
  const days = [...byDay.entries()].filter(([, m]) => m >= goalMin).map(([d]) => d).sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of days) {
    run = prev && shift(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
