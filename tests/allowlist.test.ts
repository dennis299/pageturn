import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "@/lib/auth/allowlist";

describe("isAllowedEmail", () => {
  it("is case-insensitive and trims", () => {
    expect(isAllowedEmail("B@x.com", " a@x.com , b@x.com")).toBe(true);
  });
  it("rejects when the allowlist is empty", () => {
    expect(isAllowedEmail("a@x.com", "")).toBe(false);
  });
  it("rejects a missing email", () => {
    expect(isAllowedEmail(null, "a@x.com")).toBe(false);
    expect(isAllowedEmail(undefined, "a@x.com")).toBe(false);
  });
  it("rejects emails not on the list", () => {
    expect(isAllowedEmail("c@x.com", "a@x.com,b@x.com")).toBe(false);
  });
});
