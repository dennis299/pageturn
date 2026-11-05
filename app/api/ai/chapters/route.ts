import { z } from "zod";
import { generateText, parseJsonReply } from "@/lib/ai/text";
import { chapterTitle } from "@/lib/book/chapters";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
  candidates: z.array(z.object({ page: z.number().int(), text: z.string().max(200), fontSize: z.number() })).max(800),
});
const Reply = z.object({ chapters: z.array(z.object({ title: z.string().min(1).max(200), page: z.number().int() })) });

const SYSTEM =
  "You find the chapters of a book from a list of large-font lines found in its PDF. " +
  'Reply with JSON only: {"chapters":[{"title":"...","page":N}]}. Pick real chapter or part starts, in page order, ' +
  "using the exact line text as the title. Ignore pull quotes, running heads, figure captions and repeated lines.";

export async function POST(request: Request) {
  try {
    await requireUser();
    const { startPage, endPage, candidates } = Body.parse(await request.json());
    const list = candidates
      .filter((c) => c.page >= startPage && c.page <= endPage)
      .map((c) => `p${c.page} [${c.fontSize}pt] ${c.text}`)
      .join("\n");
    if (!list) return Response.json({ chapters: [] });
    const { text } = await generateText({ system: SYSTEM, prompt: `Pages ${startPage}-${endPage}. Lines:\n${list}`, json: true });
    const { chapters } = Reply.parse(parseJsonReply(text));
    const clean = chapters
      .filter((c) => c.page >= startPage && c.page <= endPage)
      .sort((a, b) => a.page - b.page)
      .filter((c, i, arr) => i === 0 || arr[i - 1].page !== c.page)
      .map((c) => ({ ...c, title: chapterTitle(c.title) }));
    return Response.json({ chapters: clean });
  } catch (e) {
    return jsonError(e);
  }
}
