import { createHash, randomBytes } from "node:crypto";

// A company's link to register itself: 32 random bytes in the URL, only their SHA-256 stored. Pure, so it
// is unit-tested.

/** How long a link can be used. */
export const REGISTRATION_LINK_DAYS = 14;

/** The one answer to every link that doesn't open: nobody learns which ones existed. */
export const REGISTRATION_LINK_INVALID = "This registration link is no longer valid";

/** What the terms are called on the form until a manager names them otherwise: no company's name, every company has its own. */
export const DEFAULT_TERMS_NAME = "Terms and Conditions";

/** What the terms' address must be, as termsUrlOf takes it. */
export const TERMS_URL_RULE = "Enter the full web address of the terms, starting with https:// or http://";

/** The answer to a registration whose terms a manager changed after the form was opened. */
export const TERMS_CHANGED = "The terms changed — reload the page";

/** The bucket a link's registry searches are counted in: its own, never the company's (ares.service searchAllowed). */
export const registrationSearchBucket = (linkId: string) => `registration-link:${linkId}`;

export const hashRegistrationToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

export function newRegistrationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRegistrationToken(token) };
}

export const looksLikeRegistrationToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export const registrationLinkUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/register/${token}`;

/** Whether a link can be used now. */
export function linkIsOpen(link: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date): boolean {
  return !link.usedAt && !link.revokedAt && link.expiresAt.getTime() > now.getTime();
}

/** The terms' address as stored, or null when it is no plain web address: it becomes a link on a public page. */
export function termsUrlOf(text: string): string | null {
  const value = text.trim();
  if (!value || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

/** The note filed under the company once it is approved. */
export function termsNote(r: { contactFirstName: string; contactLastName: string; termsName: string; termsUrl: string; termsAcceptedAt: Date }): string {
  return `Registered through a registration link. ${r.contactFirstName} ${r.contactLastName} accepted "${r.termsName}" (${r.termsUrl}) on ${r.termsAcceptedAt.toISOString().slice(0, 10)}.`;
}

// How many registry look-ups one link may make in a rolling hour: a form needs a few, and the link is public.
export const LOOKUPS_PER_LINK_HOUR = 60;
const WINDOW_MS = 60 * 60 * 1000;
const lookups = new Map<string, number[]>();

/** Records a look-up for the link; false when that would pass the limit. */
export function lookupAllowed(linkId: string, now = Date.now()): boolean {
  const recent = (lookups.get(linkId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= LOOKUPS_PER_LINK_HOUR) {
    lookups.set(linkId, recent);
    return false;
  }
  recent.push(now);
  lookups.set(linkId, recent);
  return true;
}
