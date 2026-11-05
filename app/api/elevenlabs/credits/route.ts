import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";
import { elevenCredits } from "@/lib/tts/elevenlabs";

/** ElevenLabs credits left this month (shared with YouTube narration). */
export async function GET() {
  try {
    await requireUser();
    return Response.json(await elevenCredits(), { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    return jsonError(e);
  }
}
