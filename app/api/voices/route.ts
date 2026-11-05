import { z } from "zod";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";
import { getProvider } from "@/lib/tts";
import { ELEVEN_MODELS } from "@/lib/tts/elevenlabs";
import { GEMINI_TTS_MODELS } from "@/lib/tts/gemini";

const Provider = z.enum(["elevenlabs", "gemini", "openrouter"]);

/** Voices (and, for ElevenLabs/Gemini, models) for one provider. */
export async function GET(request: Request) {
  try {
    await requireUser();
    const provider = Provider.parse(new URL(request.url).searchParams.get("provider"));
    const voices = await getProvider(provider).listVoices();
    const models = provider === "elevenlabs" ? ELEVEN_MODELS : provider === "gemini" ? GEMINI_TTS_MODELS : undefined;
    return Response.json(
      { voices, models, configured: Boolean(process.env[{ elevenlabs: "ELEVENLABS_API_KEY", gemini: "GEMINI_API_KEY", openrouter: "OPENROUTER_API_KEY" }[provider]]) },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e) {
    return jsonError(e);
  }
}
