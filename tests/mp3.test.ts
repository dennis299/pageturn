import { describe, expect, it } from "vitest";
import { mp3DurationSec, pcmToMp3, wavToPcm } from "@/lib/audio/mp3";

describe("mp3", () => {
  it("encodes PCM and measures its duration from frame headers", () => {
    const rate = 24000;
    const pcm = new Int16Array(rate * 2);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 20) * 8000);
    const mp3 = pcmToMp3(pcm, rate);
    expect(mp3[0]).toBe(0xff);
    expect(mp3DurationSec(mp3)).toBeGreaterThan(1.9);
    expect(mp3DurationSec(mp3)).toBeLessThan(2.15);
  });

  it("skips an ID3v2 tag", () => {
    const mp3 = pcmToMp3(new Int16Array(24000), 24000);
    const tag = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10, ...new Array(10).fill(0)]);
    const withTag = new Uint8Array(tag.length + mp3.length);
    withTag.set(tag);
    withTag.set(mp3, tag.length);
    expect(mp3DurationSec(withTag)).toBeCloseTo(mp3DurationSec(mp3), 2);
  });

  it("reads PCM out of a WAV file", () => {
    const samples = new Int16Array([1, -2, 3, -4]);
    const wav = new Uint8Array(44 + 8);
    const v = new DataView(wav.buffer);
    const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF");
    v.setUint32(4, 36 + 8, true);
    w(8, "WAVE");
    w(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 22050, true);
    v.setUint32(28, 44100, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    w(36, "data");
    v.setUint32(40, 8, true);
    wav.set(new Uint8Array(samples.buffer), 44);
    const out = wavToPcm(wav);
    expect(out.sampleRate).toBe(22050);
    expect([...out.pcm]).toEqual([1, -2, 3, -4]);
  });
});
