import { describe, expect, it } from "vitest";
import { checkCreateBook, checkGenerate, GUEST_DEFAULTS, isFreeVoice, OWNER_LIMITS } from "@/lib/auth/limits";
import { isRoutableError } from "@/lib/tts/route";

describe("isFreeVoice", () => {
  it("counts free OpenRouter models and Gemini (free key) as free", () => {
    expect(isFreeVoice("openrouter", "heygen/heygen-voice-1-turbo:free")).toBe(true);
    expect(isFreeVoice("gemini", "gemini-3.8-flash-tts")).toBe(true);
  });
  it("counts paid models and ElevenLabs as paid", () => {
    expect(isFreeVoice("openrouter", "hexgrad/kokoro-82m")).toBe(false);
    expect(isFreeVoice("elevenlabs", "eleven_flash_v2_5")).toBe(false);
  });
});

describe("checkCreateBook", () => {
  const free = { provider: "openrouter" as const, model: "x:free" };
  it("lets owners do anything", () => {
    expect(() => checkCreateBook(OWNER_LIMITS, 99, { provider: "elevenlabs", model: "eleven_flash_v2_5" })).not.toThrow();
  });
  it("stops guests at their book limit", () => {
    expect(() => checkCreateBook(GUEST_DEFAULTS, 2, free)).not.toThrow();
    expect(() => checkCreateBook(GUEST_DEFAULTS, 3, free)).toThrow(/3 books/);
  });
  it("keeps guests on free voices", () => {
    expect(() => checkCreateBook(GUEST_DEFAULTS, 0, { provider: "elevenlabs", model: "eleven_flash_v2_5" })).toThrow(/free voices/);
  });
});

describe("checkGenerate", () => {
  it("stops guests at their monthly audio cap, with an error the voice router won't route around", () => {
    expect(() => checkGenerate(GUEST_DEFAULTS, 119)).not.toThrow();
    let err: unknown;
    try {
      checkGenerate(GUEST_DEFAULTS, 120);
    } catch (e) {
      err = e;
    }
    expect(String(err)).toMatch(/120 minutes/);
    expect(isRoutableError(err)).toBe(false);
  });
  it("never stops owners", () => {
    expect(() => checkGenerate(OWNER_LIMITS, 1e6)).not.toThrow();
  });
});
