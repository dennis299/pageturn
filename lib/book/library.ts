import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { progressPercent, remainingSeconds } from "@/lib/book/progress-math";

export type ShelfBook = {
  id: string;
  title: string;
  author: string | null;
  voiceName: string;
  coverPath: string | null;
  coverColor: string | null;
  percent: number;
  secondsLeft: number;
  chapterTitle: string | null;
  lastListened: string | null;
  finished: boolean;
};

/** Books with progress, most recently listened first. */
export async function loadShelf(supabase: SupabaseClient): Promise<ShelfBook[]> {
  const [{ data: books, error }, { data: progress }, { data: chapters }] = await Promise.all([
    supabase.from("ab_books").select("id,title,author,voice_name,total_chars,finished_at,created_at,cover_path,cover_color").order("created_at", { ascending: false }),
    supabase.from("ab_progress").select("book_id,chunk_idx,offset_sec,updated_at"),
    supabase.from("ab_chapters").select("book_id,idx,title,first_chunk,last_chunk,char_count").order("idx"),
  ]);
  if (error) throw error;
  const prog = new Map((progress ?? []).map((p) => [p.book_id as string, p]));
  return (books ?? [])
    .map((b) => {
      const chs = (chapters ?? []).filter((c) => c.book_id === b.id);
      const p = prog.get(b.id);
      const pos = p?.chunk_idx ?? 0;
      const percent = b.finished_at ? 1 : progressPercent(chs, pos, p?.offset_sec ?? 0);
      const current = chs.find((c) => pos >= c.first_chunk && pos <= c.last_chunk);
      return {
        id: b.id,
        title: b.title,
        author: b.author,
        voiceName: b.voice_name,
        coverPath: b.cover_path,
        coverColor: b.cover_color,
        percent,
        secondsLeft: remainingSeconds(b.total_chars, percent),
        chapterTitle: current?.title ?? null,
        lastListened: p && Date.parse(p.updated_at) > 0 ? p.updated_at : null,
        finished: Boolean(b.finished_at),
      } satisfies ShelfBook;
    })
    .sort((a, b) => (b.lastListened ?? "").localeCompare(a.lastListened ?? ""));
}
