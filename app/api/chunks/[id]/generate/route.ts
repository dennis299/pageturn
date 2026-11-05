import { generateChunk } from "@/lib/generate";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Generates one chunk's audio (no-op if it's already ready or being generated elsewhere). */
export async function POST(_request: Request, ctx: RouteContext<"/api/chunks/[id]/generate">) {
  try {
    const { supabase } = await requireUser();
    const { id } = await ctx.params;
    const { claimed, chunk } = await generateChunk(supabase, id);
    return Response.json({ claimed, chunk });
  } catch (e) {
    return jsonError(e);
  }
}
