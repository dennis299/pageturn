import { Suspense } from "react";
import Link from "next/link";
import { Play, Plus } from "lucide-react";
import { BookCover } from "@/components/book-cover";
import { Wordmark } from "@/components/app-shell";
import { TodayGoal } from "@/components/library/today-goal";
import { buttonVariants } from "@/components/ui/button";
import { loadShelf } from "@/lib/book/library";
import { formatDuration } from "@/lib/book/progress-math";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function ShelfPage() {
  const { supabase } = await requireUser();
  const books = await loadShelf(supabase);
  const current = books.find((b) => b.lastListened && !b.finished);

  return (
    <div className="pt-safe mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 md:py-10">
      <header className="flex items-center justify-between gap-4">
        <Wordmark className="md:hidden" />
        <h1 className="hidden font-serif text-4xl md:block">Your shelf</h1>
        <Suspense fallback={<div className="size-12 rounded-full border-4 border-muted" aria-hidden />}>
          <TodayGoal />
        </Suspense>
      </header>

      {books.length === 0 ? (
        <section className="mt-16 flex flex-col items-start gap-4 sm:mt-24">
          <h2 className="max-w-md font-serif text-3xl leading-tight text-balance">Add a PDF and it becomes an audiobook.</h2>
          <p className="max-w-md text-muted-foreground">
            Choose where the book starts, pick a voice, and press play. Your place is saved on every device.
          </p>
          <Link href="/import" className={cn(buttonVariants(), "mt-2 h-12 px-5 text-base")}>
            <Plus aria-hidden /> Add your first book
          </Link>
        </section>
      ) : (
        <>
          {current && (
            <section aria-labelledby="continue" className="mt-8">
              <h2 id="continue" className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                Continue listening
              </h2>
              <Link
                href={`/book/${current.id}`}
                className="press group mt-3 flex items-center gap-5 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent/40 sm:p-5"
              >
                <BookCover id={current.id} title={current.title} progress={current.percent} size="sm" className="w-20 sm:w-24" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-xl sm:text-2xl">{current.title}</p>
                  {current.chapterTitle && <p className="mt-1 truncate text-sm text-muted-foreground italic">{current.chapterTitle}</p>}
                  <p className="tabular mt-2 font-mono text-xs text-muted-foreground">
                    {Math.max(1, Math.round(current.percent * 100))}% · {formatDuration(current.secondsLeft)} left
                  </p>
                </div>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-105">
                  <Play className="size-5 translate-x-px fill-current" aria-hidden />
                  <span className="sr-only">Resume {current.title}</span>
                </span>
              </Link>
            </section>
          )}

          <section aria-labelledby="shelf" className="mt-10">
            <h2 id="shelf" className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Shelf · {books.length} {books.length === 1 ? "book" : "books"}
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {books.map((b) => (
                <li key={b.id}>
                  <Link href={`/book/${b.id}`} className="press group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                    <BookCover id={b.id} title={b.title} author={b.author} progress={b.percent} className="transition-transform duration-200 group-hover:-translate-y-1" />
                    <p className="mt-3 line-clamp-2 text-sm leading-snug font-medium">{b.title}</p>
                    <p className="tabular mt-1 font-mono text-[11px] text-muted-foreground">
                      {b.finished ? "Finished" : b.lastListened ? `${Math.max(1, Math.round(b.percent * 100))}%` : "Not started"} · {b.voiceName}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
