import { describe, expect, it } from "vitest";
import { userFromClaims } from "@/lib/auth/claims";

describe("userFromClaims", () => {
  it("returns id and email from verified JWT claims", () => {
    expect(userFromClaims({ sub: "u1", email: "A@x.com", role: "authenticated" })).toEqual({ id: "u1", email: "A@x.com" });
  });
  it("returns null without a subject", () => {
    expect(userFromClaims(undefined)).toBeNull();
    expect(userFromClaims({ email: "a@x.com" })).toBeNull();
  });
  it("rejects anonymous sessions", () => {
    expect(userFromClaims({ sub: "u1", email: "a@x.com", is_anonymous: true })).toBeNull();
  });
});
