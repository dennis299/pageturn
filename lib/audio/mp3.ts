import { Mp3Encoder } from "@breezystack/lamejs";

/** Encodes mono 16-bit PCM to MP3 (default 64 kbps). */
export function pcmToMp3(pcm: Int16Array, sampleRate: number, kbps = 64): Uint8Array {
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const block = 1152 * 20;
  for (let i = 0; i < pcm.length; i += block) {
    const out = enc.encodeBuffer(pcm.subarray(i, i + block));
    if (out.length) parts.push(new Uint8Array(out));
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const mp3 = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    mp3.set(p, o);
    o += p.length;
  }
  return mp3;
}

const BITRATES: Record<string, number[]> = {
  // MPEG-1 Layer III
  "1": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  // MPEG-2 / 2.5 Layer III
  "2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Duration of an MP3 in seconds, by walking its frame headers (skips an ID3v2 tag). */
export function mp3DurationSec(bytes: Uint8Array): number {
  let i = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    i = 10 + size;
  }
  let seconds = 0;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const version = (bytes[i + 1] >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (bytes[i + 1] >> 1) & 0x03; // 1 = Layer III
    const brIdx = (bytes[i + 2] >> 4) & 0x0f;
    const srIdx = (bytes[i + 2] >> 2) & 0x03;
    const pad = (bytes[i + 2] >> 1) & 0x01;
    if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) {
      i++;
      continue;
    }
    const mpeg1 = version === 3;
    const bitrate = BITRATES[mpeg1 ? "1" : "2"][brIdx] * 1000;
    const rate = RATES[version][srIdx];
    const samples = mpeg1 ? 1152 : 576;
    const frameLen = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / rate) + pad;
    if (frameLen < 4) {
      i++;
      continue;
    }
    seconds += samples / rate;
    i += frameLen;
  }
  return seconds;
}

/** Pulls 16-bit PCM and the sample rate out of a WAV file (first channel only). */
export function wavToPcm(wav: Uint8Array): { pcm: Int16Array; sampleRate: number } {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let o = 12;
  let sampleRate = 24000;
  let channels = 1;
  while (o + 8 <= wav.length) {
    const id = String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      channels = v.getUint16(o + 10, true);
      sampleRate = v.getUint32(o + 12, true);
    } else if (id === "data") {
      const len = Math.min(size, wav.length - o - 8);
      const all = new Int16Array(wav.slice(o + 8, o + 8 + len - (len % 2)).buffer);
      if (channels === 1) return { pcm: all, sampleRate };
      const mono = new Int16Array(Math.floor(all.length / channels));
      for (let i = 0; i < mono.length; i++) mono[i] = all[i * channels];
      return { pcm: mono, sampleRate };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("Not a WAV file with PCM data");
}

/** Decodes base64 to bytes (works on the server and in the browser). */
export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
