import { Suspense } from "react";
import Link from "next/link";
import { Play, Plus } from "lucide-react";
import { BookCover } from "@/components/book-cover";
import { TodayGoal } from "@/components/library/today-goal";
import { buttonVariants } from "@/components/ui/button";
import { loadShelf, type ShelfBook } from "@/lib/book/library";
import { formatDuration } from "@/lib/book/progress-math";
import { bookTint } from "@/lib/cover";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const tintOf = (b: ShelfBook) => bookTint({ id: b.id, cover_color: b.coverColor });

function status(b: ShelfBook): string {
  if (b.finished) return "Finished";
  if (!b.lastListened) return "Not started";
  return `${Math.max(1, Math.round(b.percent * 100))}% read`;
}

export default async function ShelfPage() {
  const { supabase } = await requireUser();
  const books = await loadShelf(supabase);
  const current = books.find((b) => b.lastListened && !b.finished);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pt-5 pb-6 sm:px-8 md:py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-[2.1rem] leading-none tracking-tight md:text-4xl">Your shelf</h1>
        <Suspense fallback={<div className="size-12 rounded-full border-4 border-muted" aria-hidden />}>
          <TodayGoal />
        </Suspense>
      </header>

      {books.length === 0 ? (
        <section className="mt-16 flex flex-col items-start gap-4 sm:mt-24">
          <h2 className="max-w-md font-serif text-3xl leading-tight text-balance">Add a PDF and it becomes a book you can read or listen to.</h2>
          <p className="max-w-md text-muted-foreground">Choose where the book starts, pick a voice, and press play. Your place is saved on every device.</p>
          <Link href="/import" className={cn(buttonVariants(), "mt-2 h-12 px-5 text-base")}>
            <Plus aria-hidden /> Add your first book
          </Link>
        </section>
      ) : (
        <>
          {current && (
            <section aria-label="Pick up where you left off" className="mt-6">
              <Link
                href={`/book/${current.id}`}
                className="book-card press-card group flex items-center gap-4 rounded-[1.75rem] p-4 sm:gap-6 sm:p-5"
                style={{ ["--book" as string]: tintOf(current) }}
              >
                <BookCover id={current.id} title={current.title} coverPath={current.coverPath} progress={current.percent} size="sm" className="w-[5.5rem] sm:w-28" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-white/70">Continue</p>
                  <p className="mt-0.5 line-clamp-2 font-serif text-[1.35rem] leading-tight sm:text-2xl">{current.title}</p>
                  {current.chapterTitle && <p className="mt-1 truncate text-sm text-white/75">{current.chapterTitle}</p>}
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/20" role="presentation">
                    <div className="h-full rounded-full bg-white/90" style={{ width: `${Math.max(2, Math.round(current.percent * 100))}%` }} />
                  </div>
                  <p className="tabular mt-2 text-xs text-white/70">
                    {status(current)}, about {formatDuration(current.secondsLeft)} left
                  </p>
                </div>
                <span className="flex size-12 shrink-0 items-center justify-center self-end rounded-full bg-white text-black transition-transform group-hover:scale-105">
                  <Play className="size-5 translate-x-px fill-current" aria-hidden />
                  <span className="sr-only">Open {current.title}</span>
                </span>
              </Link>
            </section>
          )}

          <section aria-labelledby="shelf" className="mt-9">
            <h2 id="shelf" className="text-xl font-semibold tracking-tight">
              {books.length === 1 ? "1 book" : `${books.length} books`}
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {books.map((b) => (
                <li key={b.id}>
                  <Link href={`/book/${b.id}`} className="press-card group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                    <BookCover
                      id={b.id}
                      title={b.title}
                      author={b.author}
                      coverPath={b.coverPath}
                      progress={b.percent}
                      className="transition-transform duration-200 group-hover:-translate-y-1"
                    />
                    <p className="mt-3 line-clamp-2 text-[15px] leading-snug font-medium">{b.title}</p>
                    <p className="tabular mt-0.5 text-[13px] text-muted-foreground">{status(b)}</p>
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
