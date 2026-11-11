import { BUCKET } from "@/lib/env";
import { HttpError, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

/**
 * A book's cover photo. Covers sit in private storage, so the app loads them through here. The
 * address carries the file name (?v=…), so the phone can keep each photo for good: a new cover
 * gets a new address.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/books/[id]/cover">) {
  try {
    const { supabase } = await requireUser();
    const { id } = await ctx.params;
    const { data: book } = await supabase.from("ab_books").select("cover_path").eq("id", id).maybeSingle();
    if (!book?.cover_path) throw new HttpError(404, "This book has no cover photo.");
    const { data, error } = await supabase.storage.from(BUCKET).download(book.cover_path);
    if (error || !data) throw new HttpError(404, "The cover photo is missing.");
    return new Response(data, {
      headers: {
        "Content-Type": data.type || "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
