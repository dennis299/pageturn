import { z } from "zod";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";
import { getProvider } from "@/lib/tts";

export const maxDuration = 60;

const Body = z.object({
  provider: z.enum(["elevenlabs", "gemini", "openrouter"]),
  voiceId: z.string().min(1).max(200),
  model: z.string().max(200).optional(),
  text: z.string().max(300).optional(),
});

/** A short spoken sample so you can hear a voice before choosing it. */
export async function POST(request: Request) {
  try {
    await requireUser();
    const b = Body.parse(await request.json());
    const text = b.text?.trim() || "This is how your book will sound. Chapter one. It was a quiet evening, and the house was still.";
    const { audio } = await getProvider(b.provider).synthesize({ text, voiceId: b.voiceId, model: b.model });
    return new Response(audio as BodyInit, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return jsonError(e);
  }
}
