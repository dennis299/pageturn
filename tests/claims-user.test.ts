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

import { accessRole } from "@/lib/auth/claims";
describe("accessRole", () => {
  const allow = "owner@x.com";
  it("makes allow-listed emails owners", () => {
    expect(accessRole({ sub: "u1", email: "Owner@x.com" }, allow)).toBe("owner");
  });
  it("makes accounts marked by the server guests", () => {
    expect(accessRole({ sub: "u2", email: "g@x.com", app_metadata: { pageturn: { role: "guest" } } }, allow)).toBe("guest");
  });
  it("refuses everyone else, even if they edit their own user_metadata", () => {
    expect(accessRole({ sub: "u3", email: "z@x.com", user_metadata: { pageturn: { role: "guest" } } }, allow)).toBeNull();
    expect(accessRole(undefined, allow)).toBeNull();
  });
});
