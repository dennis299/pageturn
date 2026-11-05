import { describe, expect, it, vi } from "vitest";
import { generateChunk } from "@/lib/generate";
import { HttpError } from "@/lib/http";

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

  it("routes to the next free voice on a rate limit and switches the book to it", async () => {
    const fake = fakeSupabase({ claim: [chunk], chunk, book });
    const heygen = vi.fn(async () => {
      throw new HttpError(429, "OpenRouter 429: free-models-per-day limit exceeded");
    });
    const gemini = vi.fn(async () => ({ audio: new Uint8Array([9]), durationSec: 3 }));
    const r = await generateChunk(fake.client as never, "c1", {
      getProvider: (id) => ({ synthesize: id === "gemini" ? gemini : heygen }) as never,
      allowPaid: false,
      checkBudget: async () => {},
    });
    expect(heygen).toHaveBeenCalledTimes(1);
    expect(gemini).toHaveBeenCalledWith(expect.objectContaining({ voiceId: "Sulafat" }));
    expect(r.switchedTo).toBe("Sulafat (Gemini)");
    expect(fake.updates.some((u) => u.voice_provider === "gemini" && u.voice_id === "Sulafat")).toBe(true);
    expect(fake.updates.at(-1)!.status).toBe("ready");
  });

  it("fails without routing when no free voice is left for a guest", async () => {
    const fake = fakeSupabase({ claim: [chunk], chunk, book: { ...book, voice_provider: "gemini", voice_id: "Kore", voice_model: "gemini-3.8-flash-tts" } });
    const limited = vi.fn(async () => {
      throw new HttpError(429, "limit");
    });
    const r = await generateChunk(fake.client as never, "c1", {
      getProvider: () => ({ synthesize: limited }) as never,
      allowPaid: false,
      checkBudget: async () => {},
    });
    // Gemini fails, then the free OpenRouter voice fails; Kokoro is paid so a guest never gets it.
    expect(limited).toHaveBeenCalledTimes(2);
    expect(r.chunk.status).toBe("failed");
  });

  it("never uses a paid voice for a guest, even if their book was switched to one", async () => {
    const fake = fakeSupabase({ claim: [chunk], chunk, book: { voice_provider: "elevenlabs", voice_id: "Jon", voice_name: "Jon", voice_model: "eleven_flash_v2_5" } });
    const eleven = vi.fn();
    const free = vi.fn(async () => ({ audio: new Uint8Array([1]), durationSec: 2 }));
    const r = await generateChunk(fake.client as never, "c1", {
      getProvider: (id) => ({ synthesize: id === "elevenlabs" ? eleven : free }) as never,
      allowPaid: false,
      checkBudget: async () => {},
    });
    expect(eleven).not.toHaveBeenCalled();
    expect(r.switchedTo).toBe("Nadine");
    expect(r.chunk.status).toBe("ready");
  });

  it("marks chunk failed and does not retry automatically", async () => {
    const fake = fakeSupabase({ claim: [chunk], chunk, book });
    const synthesize = vi.fn(async () => {
      throw new Error("500 provider exploded");
    });
    const r = await generateChunk(fake.client as never, "c1", { getProvider: () => ({ synthesize }) as never });
    expect(synthesize).toHaveBeenCalledTimes(1);
    const last = fake.updates.at(-1)!;
    expect(last.status).toBe("failed");
    expect(String(last.error)).toContain("500");
    expect(r.chunk.status).toBe("failed");
  });
});
