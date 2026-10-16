import { describe, expect, it } from "vitest";
import { hashToken, haulierLinkUrl, linkExpiry, looksLikeToken, newToken, tokenMatches } from "../lib/haulierToken";

describe("haulier link tokens", () => {
  it("makes a URL-safe 43-character token and stores only its SHA-256", () => {
    const { token, hash } = newToken();
    expect(looksLikeToken(token)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
    expect(newToken().token).not.toBe(token);
  });

  it("matches a token only against its own hash", () => {
    const a = newToken();
    const b = newToken();
    expect(tokenMatches(a.hash, a.token)).toBe(true);
    expect(tokenMatches(a.hash, b.token)).toBe(false);
    // A malformed stored hash never matches (and never throws).
    expect(tokenMatches("abc", a.token)).toBe(false);
  });

  it("takes only what can be a token", () => {
    expect(looksLikeToken("x".repeat(42))).toBe(false);
    expect(looksLikeToken("x".repeat(44))).toBe(false);
    expect(looksLikeToken(`${"x".repeat(42)}/`)).toBe(false);
    expect(looksLikeToken(undefined)).toBe(false);
  });

  it("expires 30 days after the planned pick-up, in the Prague evening", () => {
    expect(linkExpiry("2026-10-16").toISOString()).toBe("2026-11-15T22:59:59.000Z");
  });

  it("builds the haulier's URL without a double slash", () => {
    expect(haulierLinkUrl("https://app.example/", "T")).toBe("https://app.example/haulier/order/T");
  });
});
