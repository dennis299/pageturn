import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gemini } from "@/lib/tts/gemini";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "k");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** One second of silence, the way Gemini returns audio: base64 PCM with the rate in the MIME type. */
const audioReply = () => {
  const pcm = new Uint8Array(new Int16Array(24000).buffer);
  let bin = "";
  pcm.forEach((b) => (bin += String.fromCharCode(b)));
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: btoa(bin) } }] } }] }),
  );
};

describe("gemini.synthesize", () => {
  it("sends the book text and nothing else, because Gemini speaks every word it is given", async () => {
    fetchMock.mockResolvedValueOnce(audioReply());
    const text = "Every evening at a quarter past six, Ada climbed the ladder.";
    await gemini.synthesize({ text, voiceId: "Sulafat" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spoken = body.contents.flatMap((c: { parts: { text?: string }[] }) => c.parts.map((p) => p.text ?? "")).join("");
    expect(spoken).toBe(text);
    expect(JSON.stringify(body)).not.toMatch(/read this aloud|narrator/i);
  });

  it("uses the chosen voice and returns playable audio with its length", async () => {
    fetchMock.mockResolvedValueOnce(audioReply());
    const r = await gemini.synthesize({ text: "Hello.", voiceId: "Gacrux", model: "gemini-3.8-flash-tts" });

    expect(fetchMock.mock.calls[0][0]).toContain("models/gemini-3.8-flash-tts:generateContent");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Gacrux");
    expect(r.durationSec).toBeCloseTo(1, 0);
  });
});
