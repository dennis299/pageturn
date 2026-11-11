import { z } from "zod";
import { BUCKET } from "@/lib/env";
import { HttpError, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

const Patch = z
  .object({
    title: z.string().trim().min(1).max(300),
    author: z.string().trim().max(200).nullable(),
    coverPath: z.string().max(300).nullable(),
    coverColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .nullable(),
  })
  .partial();

/** Changes a book's details: its title, author, or cover photo. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/books/[id]">) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await ctx.params;
    const b = Patch.parse(await request.json());

    const { data: book, error: findErr } = await supabase.from("ab_books").select("id,cover_path").eq("id", id).maybeSingle();
    if (findErr) throw findErr;
    if (!book) throw new HttpError(404, "Book not found.");

    const patch: Record<string, string | null> = {};
    if (b.title !== undefined) patch.title = b.title;
    if (b.author !== undefined) patch.author = b.author || null;
    if (b.coverPath !== undefined) {
      // A cover must be a file in this book's own folder.
      if (b.coverPath !== null && !b.coverPath.startsWith(`${user.id}/${id}/cover-`)) throw new HttpError(400, "That cover doesn't belong to this book.");
      patch.cover_path = b.coverPath;
      patch.cover_color = b.coverPath === null ? null : (b.coverColor ?? null);
    } else if (b.coverColor !== undefined) {
      patch.cover_color = b.coverColor;
    }
    if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to change.");

    const { data: saved, error } = await supabase.from("ab_books").update(patch).eq("id", id).select("id,title,author,cover_path,cover_color").single();
    if (error) throw error;
    // The photo that was replaced isn't needed any more.
    if (b.coverPath !== undefined && book.cover_path && book.cover_path !== b.coverPath) {
      await supabase.storage.from(BUCKET).remove([book.cover_path]).catch(() => {});
    }
    return Response.json({ book: saved });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Those details aren't valid." }, { status: 400 });
    return jsonError(e);
  }
}

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
