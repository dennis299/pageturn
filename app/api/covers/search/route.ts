import { z } from "zod";
import { HttpError, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

const Query = z.object({ q: z.string().trim().min(2).max(200) });

type Doc = {
  cover_i?: number;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  /** The edition that best matches the search (and English, when there is one), with its own cover. */
  editions?: { docs?: { cover_i?: number; title?: string }[] };
};

/**
 * Looks a title up on Open Library and returns the published covers it finds. Only runs when you
 * press "Find the published cover": the title you typed is the only thing sent.
 */
export async function POST(request: Request) {
  try {
    await requireUser();
    const { q } = Query.parse(await request.json());
    // A "work" on Open Library carries one cover for all its editions, often a translation's. Asking
    // for the best-matching English edition gives the cover a reader here would recognise.
    const fields = "cover_i,title,author_name,first_publish_year,editions,editions.cover_i,editions.title";
    const url = `https://openlibrary.org/search.json?limit=14&lang=en&fields=${fields}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Pageturn (personal audiobook app)" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new HttpError(502, "The cover library didn't answer. Try again in a moment.");
    const docs = ((await res.json()) as { docs?: Doc[] }).docs ?? [];
    const seen = new Set<number>();
    const covers: { id: number; title: string; author: string; year: number | null }[] = [];
    for (const d of docs) {
      const edition = d.editions?.docs?.find((e) => typeof e.cover_i === "number" && e.cover_i > 0);
      const id = edition?.cover_i ?? d.cover_i;
      if (typeof id !== "number" || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      covers.push({ id, title: edition?.title ?? d.title ?? "", author: d.author_name?.[0] ?? "", year: d.first_publish_year ?? null });
      if (covers.length === 9) break;
    }
    return Response.json({ covers });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Type a title to search for." }, { status: 400 });
    if (e instanceof Error && e.name === "TimeoutError") return Response.json({ error: "The cover library took too long. Try again." }, { status: 504 });
    return jsonError(e);
  }
}
