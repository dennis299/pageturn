import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pcmToMp3 } from "@/lib/audio/mp3";
import { openrouter } from "@/lib/tts/openrouter";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "k");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const pcmOnly = () =>
  new Response(JSON.stringify({ error: { message: 'HeyGen Voice only supports response_format "pcm".' } }), { status: 400 });

describe("openrouter.synthesize", () => {
  it("retries with PCM when a model only supports PCM, and converts it using the header's rate", async () => {
    const rate = 44100;
    const pcm = new Int16Array(rate * 2); // 2 s
    fetchMock
      .mockResolvedValueOnce(pcmOnly())
      .mockResolvedValueOnce(new Response(new Uint8Array(pcm.buffer), { headers: { "content-type": `audio/pcm;rate=${rate};channels=1` } }));
    const r = await openrouter.synthesize({ text: "hi", voiceId: "nadine", model: "heygen/x:free" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBe("pcm");
    expect(r.audio[0]).toBe(0xff);
    expect(r.durationSec).toBeGreaterThan(1.9);
    expect(r.durationSec).toBeLessThan(2.15);
  });

  it("remembers that a model needs PCM and asks for it first next time", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(new Int16Array(24000).buffer), { headers: { "content-type": "audio/pcm;rate=24000;channels=1" } }),
    );
    await openrouter.synthesize({ text: "hi", voiceId: "nadine", model: "heygen/x:free" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toBe("pcm");
  });

  it("passes MP3 straight through", async () => {
    const mp3 = pcmToMp3(new Int16Array(24000), 24000);
    fetchMock.mockResolvedValueOnce(new Response(mp3 as BodyInit, { headers: { "content-type": "audio/mpeg" } }));
    const r = await openrouter.synthesize({ text: "hi", voiceId: "af_heart", model: "hexgrad/kokoro-82m" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toBe("mp3");
    expect(r.durationSec).toBeCloseTo(1, 0);
  });
});
