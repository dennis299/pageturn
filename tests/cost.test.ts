import { describe, expect, it } from "vitest";
import { estimateCost } from "@/lib/tts/cost";

describe("estimateCost", () => {
  it("ElevenLabs Flash costs half a credit per character", () => {
    expect(estimateCost(450_000, "elevenlabs", "eleven_flash_v2_5")).toMatchObject({ unit: "credits", amount: 225_000 });
  });
  it("ElevenLabs Multilingual costs one credit per character", () => {
    expect(estimateCost(1000, "elevenlabs", "eleven_multilingual_v2").amount).toBe(1000);
  });
  it("Gemini 3.1 preview TTS is about $15 for a 450k-character book", () => {
    const c = estimateCost(450_000, "gemini", "gemini-3.1-flash-tts-preview");
    expect(c.unit).toBe("usd");
    expect(c.amount).toBeCloseTo(15.11, 1);
  });
  it("OpenRouter free models are free", () => {
    expect(estimateCost(450_000, "openrouter", "x:free", { prompt: 0, completion: 0 })).toMatchObject({
      unit: "free",
      amount: 0,
      label: "Free",
    });
  });
  it("OpenRouter priced models use per-character prices", () => {
    const c = estimateCost(450_000, "openrouter", "hexgrad/kokoro-82m", { prompt: 0.00000062, completion: 0 });
    expect(c.amount).toBeCloseTo(0.279, 2);
    expect(c.label).toBe("≈ $0.28");
  });
});
