import type { Metadata } from "next";
import Link from "next/link";
import { MinutesBars, StreakHeatmap } from "@/components/stats/charts";
import { GoalRing } from "@/components/stats/goal-ring";
import { formatDuration } from "@/lib/book/progress-math";
import { loadStats } from "@/lib/stats/load";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stats" };

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-2 font-serif text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function StatsPage() {
  const { supabase } = await requireUser();
  const s = await loadStats(supabase);
  const reading = s.books.filter((b) => !b.finished && b.percent > 0);

  return (
    <div className="pt-safe mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 md:py-10">
      <h1 className="font-serif text-3xl sm:text-4xl">Your listening</h1>

      <section className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <GoalRing minutes={s.todayMinutes} goal={s.goal} size={72} />
        <div>
          <p className="font-medium">
            {s.todayMinutes >= s.goal ? "Today's goal is done." : `${Math.max(0, Math.ceil(s.goal - s.todayMinutes))} minutes to go today.`}
          </p>
          <p className="text-sm text-muted-foreground">
            Goal: {s.goal} minutes a day.{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Change it
            </Link>
          </p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totals">
        <Tile label="Current streak" value={s.streak} sub={s.streak === 1 ? "day" : "days"} />
        <Tile label="Best streak" value={s.best} sub={s.best === 1 ? "day" : "days"} />
        <Tile
          label="Listened"
          value={s.totalSeconds >= 3600 ? Math.round((s.totalSeconds / 3600) * 10) / 10 : Math.round(s.totalSeconds / 60)}
          sub={s.totalSeconds >= 3600 ? "hours, all time" : "minutes, all time"}
        />
        <Tile label="Finished" value={s.finished} sub={s.finished === 1 ? "book" : "books"} />
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-labelledby="days">
        <h2 id="days" className="font-medium">
          Last 14 days
        </h2>
        <p className="text-sm text-muted-foreground">Minutes listened each day</p>
        <div className="mt-4">
          <MinutesBars data={s.last14} goal={s.goal} />
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-labelledby="weeks">
        <h2 id="weeks" className="font-medium">
          12 weeks
        </h2>
        <div className="mt-4">
          <StreakHeatmap weeks={s.weeks} goal={s.goal} today={s.today} />
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-labelledby="books">
        <h2 id="books" className="font-medium">
          Books in progress
        </h2>
        {reading.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Start a book and its progress shows here.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {reading.map((b) => (
              <li key={b.id}>
                <Link href={`/book/${b.id}`} className="block">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-serif text-lg">{b.title}</span>
                    <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                      {Math.round(b.percent * 100)}% · {formatDuration(b.secondsLeft)} left
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(b.percent * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.title} progress`}>
                    <div className="h-full rounded-full bg-chart-mark" style={{ width: `${b.percent * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
