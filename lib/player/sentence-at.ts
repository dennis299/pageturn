import type { SentenceTiming } from "@/lib/db/types";

/** Index of the sentence being spoken at time `t` (binary search); -1 before the first one. */
export function sentenceAt(timings: SentenceTiming[], t: number): number {
  let lo = 0;
  let hi = timings.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timings[mid].t0 <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
