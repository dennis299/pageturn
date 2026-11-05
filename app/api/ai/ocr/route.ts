import { z } from "zod";
import { generateText } from "@/lib/ai/text";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({ imageBase64: z.string().startsWith("data:image/").max(4_000_000) });

const SYSTEM =
  "You transcribe scanned book pages for an audiobook. Transcribe the page's body text exactly, in reading order. " +
  "Omit page numbers, running headers and footnotes. Join words hyphenated across lines. Output plain text only, with a blank line between paragraphs.";

export async function POST(request: Request) {
  try {
    await requireUser();
    const { imageBase64 } = Body.parse(await request.json());
    const { text, model } = await generateText({ system: SYSTEM, prompt: "Transcribe this page.", imageBase64 });
    return Response.json({ text: text.trim(), model });
  } catch (e) {
    return jsonError(e);
  }
}
