import { z } from "zod";
import { generateText } from "@/lib/ai/text";
import { recapSource } from "@/lib/book/recap";
import { BUCKET } from "@/lib/env";
import { HttpError, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";
import { getProvider } from "@/lib/tts";
import { elevenCredits } from "@/lib/tts/elevenlabs";
import { fallbackChain, isRoutableError } from "@/lib/tts/route";
import { getLimits, isFreeVoice } from "@/lib/auth/limits";
import type { ProviderId } from "@/lib/db/types";

export const maxDuration = 60;

const Body = z.object({ posIdx: z.number().int().min(1) });
const SYSTEM =
  "You write a short 'Previously…' recap for someone returning to an audiobook after a break. " +
  "In about 60 words of plain, warm prose, remind them what was happening just before they stopped. " +
  "Only use what is in the text. No spoilers, no headings, no lists. Start with 'Previously,'.";

/** A spoken ~20-second recap of what you heard just before your current position. */
export async function POST(request: Request, ctx: RouteContext<"/api/books/[id]/recap">) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await ctx.params;
    const { posIdx } = Body.parse(await request.json());

    const { data: book, error } = await supabase.from("ab_books").select("voice_provider,voice_id,voice_model,recap").eq("id", id).single();
    if (error) throw new HttpError(404, "Book not found.");
    if (book.recap?.posIdx === posIdx) return Response.json({ text: book.recap.text, audioPath: book.recap.audioPath });

    const { data: chunks } = await supabase
      .from("ab_chunks")
      .select("idx,text")
      .eq("book_id", id)
      .gte("idx", Math.max(0, posIdx - 10))
      .lt("idx", posIdx);
    const source = recapSource(chunks ?? [], posIdx, 4000);
    if (!source) throw new HttpError(400, "There's nothing to recap yet.");

    const { text } = await generateText({ system: SYSTEM, prompt: source });
    const recapText = text.trim().replace(/\s+/g, " ").slice(0, 700);

    let voice = { provider: book.voice_provider as ProviderId, voiceId: book.voice_id as string, model: (book.voice_model ?? undefined) as string | undefined };
    if (voice.provider === "elevenlabs" && process.env.OPENROUTER_API_KEY) {
      const c = await elevenCredits().catch(() => null);
      if (c && c.remaining < 2000) voice = { provider: "openrouter", voiceId: "nadine", model: "heygen/heygen-voice-1-turbo:free" };
    }
    const limits = await getLimits(supabase, user);
    const tries = [voice, ...fallbackChain({ provider: voice.provider, model: voice.model }, { allowPaid: !limits.freeVoicesOnly })].filter(
      (v) => !limits.freeVoicesOnly || isFreeVoice(v.provider, v.model),
    );
    let audio: Uint8Array | undefined;
    let lastErr: unknown;
    for (const v of tries) {
      try {
        audio = (await getProvider(v.provider).synthesize({ text: recapText, voiceId: v.voiceId, model: v.model })).audio;
        break;
      } catch (e) {
        lastErr = e;
        if (!isRoutableError(e)) break;
      }
    }
    if (!audio) throw lastErr ?? new HttpError(502, "No voice could read the recap.");
    const audioPath = `${user.id}/${id}/recap.mp3`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(audioPath, audio, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw upErr;
    await supabase.from("ab_books").update({ recap: { posIdx, text: recapText, audioPath, at: new Date().toISOString() } }).eq("id", id);
    return Response.json({ text: recapText, audioPath });
  } catch (e) {
    return jsonError(e);
  }
}
