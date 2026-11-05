import { BUCKET } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

/** Deletes a book: its audio and PDF in storage, then the rows (chapters, parts, progress, bookmarks cascade). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/books/[id]">) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await ctx.params;
    const folder = `${user.id}/${id}`;
    for (;;) {
      const { data: files } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
      if (!files?.length) break;
      const { error } = await supabase.storage.from(BUCKET).remove(files.map((f) => `${folder}/${f.name}`));
      if (error) throw error;
      if (files.length < 1000) break;
    }
    const { error } = await supabase.from("ab_books").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ deleted: true });
  } catch (e) {
    return jsonError(e);
  }
}
