import { checkGenerate, getLimits, monthlyMinutesUsed } from "@/lib/auth/limits";
import { generateChunk } from "@/lib/generate";
import { getProvider } from "@/lib/tts";
import { elevenVoiceFrom, loadVoicePrefs } from "@/lib/voice-prefs";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Generates one chunk's audio (no-op if it's already ready or being generated elsewhere). */
export async function POST(_request: Request, ctx: RouteContext<"/api/chunks/[id]/generate">) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await ctx.params;
    const limits = await getLimits(supabase, user);
    if (limits.monthlyAudioMinutes !== null) checkGenerate(limits, await monthlyMinutesUsed(supabase, user.id));
    const prefs = await loadVoicePrefs(supabase, user.id);
    const result = await generateChunk(supabase, id, {
      getProvider,
      allowPaid: !limits.freeVoicesOnly,
      order: prefs.routeOrder,
      elevenVoice: elevenVoiceFrom(prefs),
    });
    return Response.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
