import { z } from "zod";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({
  bookId: z.uuid(),
  chunkIdx: z.number().int().min(0),
  offsetSec: z.number().min(0),
  updatedAt: z.iso.datetime(),
  sessionId: z.uuid().optional(),
  addSeconds: z.number().min(0).max(600).optional(),
  finished: z.boolean().optional(),
});

/**
 * Saves your place (only if it's newer than what's stored) and adds listening time to the session.
 * Accepts sendBeacon posts, so it also works when the page is closing.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const b = Body.parse(JSON.parse(await request.text()));

    const { data: existing } = await supabase.from("ab_progress").select("updated_at").eq("book_id", b.bookId).maybeSingle();
    const newer = !existing || Date.parse(b.updatedAt) >= Date.parse(existing.updated_at);
    if (newer) {
      const { error } = await supabase
        .from("ab_progress")
        .upsert({ book_id: b.bookId, user_id: user.id, chunk_idx: b.chunkIdx, offset_sec: b.offsetSec, updated_at: b.updatedAt });
      if (error) throw error;
    }

    if (b.sessionId && b.addSeconds) {
      const add = Math.round(b.addSeconds);
      const { data: s } = await supabase.from("ab_sessions").select("seconds").eq("id", b.sessionId).maybeSingle();
      if (s) {
        await supabase.from("ab_sessions").update({ seconds: s.seconds + add, last_beat: new Date().toISOString() }).eq("id", b.sessionId);
      } else {
        await supabase.from("ab_sessions").insert({ id: b.sessionId, user_id: user.id, book_id: b.bookId, seconds: add });
      }
    }

    if (b.finished) await supabase.from("ab_books").update({ finished_at: new Date().toISOString() }).eq("id", b.bookId);
    return Response.json({ saved: newer });
  } catch (e) {
    return jsonError(e);
  }
}
