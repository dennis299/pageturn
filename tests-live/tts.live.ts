import { writeFileSync, mkdirSync } from "node:fs";
import { it, expect } from "vitest";
import { elevenlabs, elevenCredits } from "@/lib/tts/elevenlabs";
import { gemini } from "@/lib/tts/gemini";
import { sentenceTimings } from "@/lib/tts/timings";

const TEXT = "Chapter One. It was a quiet night in the library.";
mkdirSync("tests-live/out", { recursive: true });

it("gemini speaks only the text", async () => {
  const r = await gemini.synthesize({ text: TEXT, voiceId: "Sulafat" });
  writeFileSync("tests-live/out/gemini.mp3", r.audio);
  console.log("gemini seconds", r.durationSec.toFixed(2), "bytes", r.audio.length);
  expect(r.durationSec).toBeGreaterThan(1.5);
  expect(r.durationSec).toBeLessThan(7);
});

it("elevenlabs returns audio with alignment", async () => {
  const before = await elevenCredits();
  const r = await elevenlabs.synthesize({ text: TEXT, voiceId: "MFZUKuGQUsGJPQjTS4wC" });
  writeFileSync("tests-live/out/eleven.mp3", r.audio);
  const t = sentenceTimings(TEXT, r.durationSec, r.alignment);
  console.log("eleven seconds", r.durationSec.toFixed(2), "aligned", r.alignment?.chars.length === TEXT.length, JSON.stringify(t), "credits left", before.remaining);
  expect(r.durationSec).toBeGreaterThan(1.5);
});
