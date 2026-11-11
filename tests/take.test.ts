import { describe, expect, it } from "vitest";
import { isCurrentTake, offlineCopyUsable, takeKey } from "@/lib/audio/take";

const part = (audio_path: string | null, status = "ready") => ({ id: "c1", status, audio_path });

describe("takes of a part's audio", () => {
  it("gives a remade part a different cache key, so its old recording is never reused", () => {
    expect(takeKey(part("u/b/27-old.mp3"))).not.toBe(takeKey(part("u/b/27-new.mp3")));
    expect(takeKey(part("u/b/27-old.mp3"))).toBe(takeKey(part("u/b/27-old.mp3")));
  });

  it("knows the loaded recording is stale once the part is sent back to be remade", () => {
    expect(isCurrentTake(part("u/b/27-old.mp3"), "u/b/27-old.mp3")).toBe(true);
    // The text was corrected: the part is pending again, though it still points at the old file.
    expect(isCurrentTake(part("u/b/27-old.mp3", "pending"), "u/b/27-old.mp3")).toBe(false);
    // ...and then remade as a new file.
    expect(isCurrentTake(part("u/b/27-new.mp3"), "u/b/27-old.mp3")).toBe(false);
    expect(isCurrentTake(undefined, "u/b/27-old.mp3")).toBe(false);
    expect(isCurrentTake(part("u/b/27-old.mp3"), null)).toBe(false);
  });

  it("uses a downloaded copy only when it holds the part's current take", () => {
    expect(offlineCopyUsable("u/b/27-new.mp3", part("u/b/27-new.mp3"), true)).toBe(true);
    expect(offlineCopyUsable("u/b/27-old.mp3", part("u/b/27-new.mp3"), true)).toBe(false);
    expect(offlineCopyUsable("u/b/27-old.mp3", part("u/b/27-new.mp3"), false)).toBe(false);
  });

  it("doesn't trust an unlabelled old download while it can fetch the current audio instead", () => {
    expect(offlineCopyUsable(null, part("u/b/27-new.mp3"), true)).toBe(false);
    expect(offlineCopyUsable(null, part("u/b/27-new.mp3"), false)).toBe(true);
  });
});
