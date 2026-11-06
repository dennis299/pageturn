import { describe, expect, it } from "vitest";
import { fallbackChain } from "@/lib/tts/route";

const ids = (c: ReturnType<typeof fallbackChain>) => c.map((v) => `${v.provider}:${v.voiceId}`);
const jon = { voiceId: "MFZUKuGQUsGJPQjTS4wC", voiceName: "Jon", model: "eleven_flash_v2_5" };

describe("fallbackChain with your own order", () => {
  it("follows the order you set", () => {
    const chain = fallbackChain({ provider: "openrouter", model: "heygen/heygen-voice-1-turbo:free" }, { allowPaid: true, order: ["kokoro", "gemini"] });
    expect(ids(chain)).toEqual(["openrouter:af_heart", "gemini:Sulafat"]);
  });

  it("includes ElevenLabs only when you add it to the order", () => {
    const without = fallbackChain({ provider: "gemini", model: "gemini-3.8-flash-lite-tts" }, { allowPaid: true });
    expect(without.some((v) => v.provider === "elevenlabs")).toBe(false);
    const withEleven = fallbackChain(
      { provider: "gemini", model: "gemini-3.8-flash-lite-tts" },
      { allowPaid: true, order: ["elevenlabs", "openrouter_free"], elevenVoice: jon },
    );
    expect(ids(withEleven)).toEqual(["elevenlabs:MFZUKuGQUsGJPQjTS4wC", "openrouter:nadine"]);
  });

  it("never gives a guest ElevenLabs, even if it's in the order", () => {
    const chain = fallbackChain(
      { provider: "openrouter", model: "heygen/heygen-voice-1-turbo:free" },
      { allowPaid: false, order: ["elevenlabs", "gemini"], elevenVoice: jon },
    );
    expect(ids(chain)).toEqual(["gemini:Sulafat"]);
  });

  it("skips ElevenLabs when the ElevenLabs voice is the one that just ran out", () => {
    const chain = fallbackChain(
      { provider: "elevenlabs", model: "eleven_flash_v2_5" },
      { allowPaid: true, order: ["elevenlabs", "openrouter_free"], elevenVoice: jon },
    );
    expect(ids(chain)).toEqual(["openrouter:nadine"]);
  });
});
