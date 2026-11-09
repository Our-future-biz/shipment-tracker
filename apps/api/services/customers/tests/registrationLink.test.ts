import { describe, expect, it } from "vitest";
import { LOOKUPS_PER_LINK_HOUR, hashRegistrationToken, linkIsOpen, lookupAllowed, looksLikeRegistrationToken, newRegistrationToken, registrationLinkUrl, termsNote, termsUrlOf } from "../lib/registrationLink";

const NOW = new Date("2026-11-09T10:00:00Z");
const link = (over: Partial<Parameters<typeof linkIsOpen>[0]> = {}) => ({ usedAt: null, revokedAt: null, expiresAt: new Date("2026-11-20T10:00:00Z"), ...over });

describe("a registration link", () => {
  it("has a token that can't be guessed, of which only the hash is kept", () => {
    const { token, hash } = newRegistrationToken();
    expect(looksLikeRegistrationToken(token)).toBe(true);
    expect(hash).toBe(hashRegistrationToken(token));
    expect(hash).not.toContain(token);
    expect(newRegistrationToken().token).not.toBe(token);
  });

  it("does not take anything else for a token", () => {
    for (const bad of ["", "short", "x".repeat(44), "../".repeat(15), null, 7]) expect(looksLikeRegistrationToken(bad)).toBe(false);
  });

  it("opens the registration page of the app", () => {
    expect(registrationLinkUrl("https://app.example/", "abc")).toBe("https://app.example/register/abc");
  });

  it("works once, until it expires or is cancelled", () => {
    expect(linkIsOpen(link(), NOW)).toBe(true);
    expect(linkIsOpen(link({ usedAt: NOW }), NOW)).toBe(false);
    expect(linkIsOpen(link({ revokedAt: NOW }), NOW)).toBe(false);
    expect(linkIsOpen(link({ expiresAt: NOW }), NOW)).toBe(false);
  });

  it("limits the registry look-ups of one link", () => {
    for (let i = 0; i < LOOKUPS_PER_LINK_HOUR; i++) expect(lookupAllowed("busy", 1000)).toBe(true);
    expect(lookupAllowed("busy", 1000)).toBe(false);
    expect(lookupAllowed("other", 1000)).toBe(true);
    expect(lookupAllowed("busy", 1000 + 60 * 60 * 1000 + 1)).toBe(true);
  });
});

describe("the terms", () => {
  it("are only a plain web address: it becomes a link on a public page", () => {
    expect(termsUrlOf(" https://austromar.cz/terms ")).toBe("https://austromar.cz/terms");
    expect(termsUrlOf("http://austromar.cz/t.pdf")).toBe("http://austromar.cz/t.pdf");
    for (const bad of ["", "austromar.cz", "javascript:alert(1)", "data:text/html,x", "ftp://a.cz/t"]) expect(termsUrlOf(bad)).toBeNull();
  });

  it("are recorded under the company with who accepted them and when", () => {
    expect(termsNote({ contactFirstName: "Jan", contactLastName: "Novák", termsName: "Austromar Terms and Conditions", termsUrl: "https://a.cz/t", termsAcceptedAt: NOW })).toBe(
      'Registered through a registration link. Jan Novák accepted "Austromar Terms and Conditions" (https://a.cz/t) on 2026-11-09.',
    );
  });
});
