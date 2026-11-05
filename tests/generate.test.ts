import { describe, expect, it, vi } from "vitest";
import { generateChunk } from "@/lib/generate";

type Row = Record<string, unknown>;

/** A tiny fake of the parts of the Supabase client that generateChunk uses. */
function fakeSupabase(opts: { claim: Row[]; chunk: Row; book: Row }) {
  const updates: Row[] = [];
  const uploads: string[] = [];
  const query = (table: string) => {
    let pending: Row | undefined;
    const q = {
      select: () => q,
      eq: () => q,
      update: (r: Row) => {
        pending = r;
        updates.push(r);
        return q;
      },
      single: async () => ({ data: table === "ab_books" ? opts.book : { ...opts.chunk, ...(pending ?? {}) }, error: null }),
    };
    return q;
  };
  return {
    updates,
    uploads,
    client: {
      rpc: vi.fn(async () => ({ data: opts.claim, error: null })),
      from: query,
      storage: {
        from: () => ({
          upload: async (path: string) => {
            uploads.push(path);
            return { error: null };
          },
        }),
      },
    },
  };
}

const chunk = { id: "c1", user_id: "u1", book_id: "b1", idx: 7, text: "Hello there. General Kenobi.", status: "pending" };
const book = { voice_provider: "openrouter", voice_id: "nadine", voice_model: "heygen/heygen-voice-1-turbo:free" };

describe("generateChunk", () => {
  it("second concurrent claim returns already-claimed", async () => {
    const fake = fakeSupabase({ claim: [], chunk: { ...chunk, status: "generating" }, book });
    const synthesize = vi.fn();
    const r = await generateChunk(fake.client as never, "c1", { getProvider: () => ({ synthesize }) as never });
    expect(r.claimed).toBe(false);
    expect(synthesize).not.toHaveBeenCalled();
    expect(fake.uploads).toHaveLength(0);
  });

  it("synthesizes, uploads to {uid}/{book}/{idx}.mp3 and marks the chunk ready", async () => {
    const fake = fakeSupabase({ claim: [chunk], chunk, book });
    const synthesize = vi.fn(async () => ({ audio: new Uint8Array([1, 2, 3]), durationSec: 4 }));
    const r = await generateChunk(fake.client as never, "c1", { getProvider: () => ({ synthesize }) as never });
    expect(synthesize).toHaveBeenCalledWith({ text: chunk.text, voiceId: "nadine", model: "heygen/heygen-voice-1-turbo:free" });
    expect(fake.uploads).toEqual(["u1/b1/7.mp3"]);
    const last = fake.updates.at(-1)!;
    expect(last.status).toBe("ready");
    expect(last.duration_sec).toBe(4);
    expect(Array.isArray(last.timings)).toBe(true);
    expect(r.claimed).toBe(true);
    expect(r.chunk.status).toBe("ready");
  });

  it("marks chunk failed and does not retry automatically", async () => {
    const fake = fakeSupabase({ claim: [chunk], chunk, book });
    const synthesize = vi.fn(async () => {
      throw new Error("429 rate limited");
    });
    const r = await generateChunk(fake.client as never, "c1", { getProvider: () => ({ synthesize }) as never });
    expect(synthesize).toHaveBeenCalledTimes(1);
    const last = fake.updates.at(-1)!;
    expect(last.status).toBe("failed");
    expect(String(last.error)).toContain("429");
    expect(r.chunk.status).toBe("failed");
  });
});
