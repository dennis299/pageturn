import { HttpError, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";
import { elevenCredits } from "@/lib/tts/elevenlabs";

/** ElevenLabs credits left this month (shared with YouTube narration). */
export async function GET() {
  try {
    const { user } = await requireUser();
    if (user.role !== "owner") throw new HttpError(403, "Only the owner's account uses ElevenLabs.");
    return Response.json(await elevenCredits(), { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    return jsonError(e);
  }
}
