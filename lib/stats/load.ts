import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadShelf, type ShelfBook } from "@/lib/book/library";
import { bestStreak, currentStreak, dayKey, lastNDays, minutesByDay } from "./streak";

export type Stats = {
  goal: number;
  timezone: string;
  today: string;
  todayMinutes: number;
  streak: number;
  best: number;
  totalSeconds: number;
  finished: number;
  last14: { day: string; minutes: number }[];
  weeks: { day: string; minutes: number }[][];
  books: ShelfBook[];
};

export async function loadSettings(supabase: SupabaseClient): Promise<{ goal: number; timezone: string; remindHour: number | null; push: boolean }> {
  const { data } = await supabase.from("ab_settings").select("daily_goal_min,timezone,remind_hour,push_subscription").maybeSingle();
  return {
    goal: data?.daily_goal_min ?? 20,
    timezone: data?.timezone ?? "UTC",
    remindHour: data?.remind_hour ?? null,
    push: Boolean(data?.push_subscription),
  };
}

export async function loadStats(supabase: SupabaseClient): Promise<Stats> {
  const { goal, timezone } = await loadSettings(supabase);
  const since = new Date(Date.now() - 400 * 86400_000).toISOString();
  const [{ data: sessions }, books] = await Promise.all([
    supabase.from("ab_sessions").select("started_at,seconds").gte("started_at", since),
    loadShelf(supabase),
  ]);
  const byDay = minutesByDay(sessions ?? [], timezone);
  const today = dayKey(new Date(), timezone);
  const totalSeconds = (sessions ?? []).reduce((s, x) => s + x.seconds, 0);

  // 12 full weeks, Monday-first columns, ending with the current week.
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const days = lastNDays(today, 7 * 11 + dow + 1);
  const weeks: { day: string; minutes: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7).map((day) => ({ day, minutes: byDay.get(day) ?? 0 })));

  return {
    goal,
    timezone,
    today,
    todayMinutes: byDay.get(today) ?? 0,
    streak: currentStreak(byDay, goal, today),
    best: bestStreak(byDay, goal),
    totalSeconds,
    finished: books.filter((b) => b.finished).length,
    last14: lastNDays(today, 14).map((day) => ({ day, minutes: byDay.get(day) ?? 0 })),
    weeks,
    books,
  };
}

/** Today's minutes against the goal, for the shelf header. */
export async function loadToday(supabase: SupabaseClient): Promise<{ minutes: number; goal: number; streak: number }> {
  const { goal, timezone } = await loadSettings(supabase);
  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data } = await supabase.from("ab_sessions").select("started_at,seconds").gte("started_at", since);
  const byDay = minutesByDay(data ?? [], timezone);
  const today = dayKey(new Date(), timezone);
  return { minutes: byDay.get(today) ?? 0, goal, streak: currentStreak(byDay, goal, today) };
}
