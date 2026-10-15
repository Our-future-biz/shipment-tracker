import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { addDays } from "../../../lib/businessDate";

// The haulier's link to a transport order: 32 random bytes (base64url in the URL); only the
// SHA-256 of the token is stored. Pure helpers.

/** Days after the planned pick-up the link stays valid (the haulier uploads the POD through it). */
export const LINK_DAYS_AFTER_PICKUP = 30;

export const hashToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

/** A new token and the hash that is stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** A token as it can appear in the URL: 43 base64url characters; anything else is no token. */
export const looksLikeToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

/** Constant-time comparison of a stored hash with the hash of the token given. */
export function tokenMatches(storedHash: string, token: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The end of the 30th day after the planned pick-up (Prague evening, safely past midnight UTC). */
export const linkExpiry = (plannedPickupDate: string): Date => new Date(`${addDays(plannedPickupDate, LINK_DAYS_AFTER_PICKUP)}T22:59:59Z`);

/** Where the haulier's page lives in the web app. */
export const haulierLinkUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/haulier/order/${token}`;
