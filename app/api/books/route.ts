import { z } from "zod";
import { checkCreateBook, getLimits } from "@/lib/auth/limits";
import { HttpError, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().max(200).optional(),
  pageCount: z.number().int().min(1),
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
  sourcePath: z.string().max(300).optional(),
  voice: z.object({
    provider: z.enum(["elevenlabs", "gemini", "openrouter"]),
    voiceId: z.string().min(1).max(200),
    voiceName: z.string().min(1).max(200),
    model: z.string().max(200).optional(),
  }),
  chapters: z
    .array(z.object({ idx: z.number().int().min(0), title: z.string().min(1).max(300), firstChunk: z.number().int(), lastChunk: z.number().int(), charCount: z.number().int() }))
    .min(1)
    .max(2000),
  chunks: z
    .array(z.object({ idx: z.number().int().min(0), chapterIdx: z.number().int().min(0), page: z.number().int(), text: z.string().min(1).max(1500) }))
    .min(1)
    .max(20000),
});

/** Creates a book with its chapters and chunks (audio is generated later, on demand). */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const b = Body.parse(await request.json());
    if (b.endPage < b.startPage) throw new HttpError(400, "The end page is before the start page.");
    const limits = await getLimits(supabase, user);
    if (limits.maxBooks !== null || limits.freeVoicesOnly) {
      const { count } = await supabase.from("ab_books").select("id", { count: "exact", head: true });
      checkCreateBook(limits, count ?? 0, { provider: b.voice.provider, model: b.voice.model });
    }

    const { data: book, error } = await supabase
      .from("ab_books")
      .insert({
        ...(b.id ? { id: b.id } : {}),
        title: b.title,
        author: b.author || null,
        page_count: b.pageCount,
        start_page: b.startPage,
        end_page: b.endPage,
        source_path: b.sourcePath ?? null,
        voice_provider: b.voice.provider,
        voice_id: b.voice.voiceId,
        voice_name: b.voice.voiceName,
        voice_model: b.voice.model ?? null,
        total_chars: b.chunks.reduce((s, c) => s + c.text.length, 0),
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      const chapterRows = b.chapters.map((c) => ({
        book_id: book.id,
        user_id: user.id,
        idx: c.idx,
        title: c.title,
        first_chunk: c.firstChunk,
        last_chunk: c.lastChunk,
        char_count: c.charCount,
      }));
      const { error: chErr } = await supabase.from("ab_chapters").insert(chapterRows);
      if (chErr) throw chErr;
      for (let i = 0; i < b.chunks.length; i += 500) {
        const rows = b.chunks.slice(i, i + 500).map((c) => ({
          book_id: book.id,
          user_id: user.id,
          idx: c.idx,
          chapter_idx: c.chapterIdx,
          page: c.page,
          text: c.text,
          char_count: c.text.length,
        }));
        const { error: ckErr } = await supabase.from("ab_chunks").insert(rows);
        if (ckErr) throw ckErr;
      }
      await supabase.from("ab_progress").insert({ book_id: book.id, user_id: user.id, chunk_idx: 0, offset_sec: 0, updated_at: new Date(0).toISOString() });
    } catch (e) {
      await supabase.from("ab_books").delete().eq("id", book.id);
      throw e;
    }
    return Response.json({ id: book.id });
  } catch (e) {
    return jsonError(e);
  }
}
