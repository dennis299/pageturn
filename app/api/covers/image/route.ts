import { HttpError, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

/** One published cover from Open Library, passed through so the app can crop and save it. */
export async function GET(request: Request) {
  try {
    await requireUser();
    const params = new URL(request.url).searchParams;
    const id = params.get("id") ?? "";
    if (!/^\d{1,12}$/.test(id)) throw new HttpError(400, "That isn't a cover.");
    const size = params.get("size") === "M" ? "M" : "L";
    const res = await fetch(`https://covers.openlibrary.org/b/id/${id}-${size}.jpg`, { signal: AbortSignal.timeout(15_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new HttpError(502, "That cover couldn't be loaded.");
    return new Response(res.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    return jsonError(e);
  }
}
