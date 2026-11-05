import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http";
import { fallbackChain, isRoutableError } from "@/lib/tts/route";

describe("isRoutableError", () => {
  it("routes on rate limits, quotas and missing credit", () => {
    expect(isRoutableError(new HttpError(429, "OpenRouter 429: slow down"))).toBe(true);
    expect(isRoutableError(new HttpError(402, "ElevenLabs: not enough credits"))).toBe(true);
    expect(isRoutableError(new Error("Gemini 403: Your prepayment credits are depleted"))).toBe(true);
    expect(isRoutableError(new Error("free-models-per-day limit exceeded"))).toBe(true);
  });
  it("doesn't route on ordinary failures", () => {
    expect(isRoutableError(new HttpError(400, "An OpenRouter voice needs a model."))).toBe(false);
    expect(isRoutableError(new Error("Couldn't upload the audio"))).toBe(false);
  });
});

describe("fallbackChain", () => {
  const ids = (c: ReturnType<typeof fallbackChain>) => c.map((v) => `${v.provider}:${v.model}`);

  it("goes free → Gemini → Kokoro from the free OpenRouter voice", () => {
    expect(ids(fallbackChain({ provider: "openrouter", model: "heygen/heygen-voice-1-turbo:free" }, { allowPaid: true }))).toEqual([
      "gemini:gemini-3.8-flash-tts",
      "openrouter:hexgrad/kokoro-82m",
    ]);
  });

  it("never offers ElevenLabs, and starts from the top for an ElevenLabs book", () => {
    const chain = fallbackChain({ provider: "elevenlabs", model: "eleven_flash_v2_5" }, { allowPaid: true });
    expect(chain[0].provider).toBe("openrouter");
    expect(chain.some((v) => v.provider === "elevenlabs")).toBe(false);
  });

  it("leaves out paid voices when paid isn't allowed (guests)", () => {
    expect(ids(fallbackChain({ provider: "openrouter", model: "heygen/heygen-voice-1-turbo:free" }, { allowPaid: false }))).toEqual([
      "gemini:gemini-3.8-flash-tts",
    ]);
  });

  it("skips the provider that just failed", () => {
    const chain = fallbackChain({ provider: "gemini", model: "gemini-3.8-flash-tts" }, { allowPaid: true });
    expect(chain.some((v) => v.provider === "gemini")).toBe(false);
  });
});
