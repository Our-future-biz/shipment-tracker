import { APIError } from "encore.dev/api";
import type { PortalUserRecord } from "../schemas/portal.schema";
import type { PortalUserItem } from "../interfaces/portal.interfaces";

// Haulier portal rules: passwords, the login throttle, session lifetimes, the one-time links and
// how a portal user is shown. Pure (the tokens themselves are made and hashed by haulierToken.ts).

export const MIN_PASSWORD = 12;
/** argon2 hashes whatever it is given: a cap keeps a huge "password" from costing the server. */
export const MAX_PASSWORD = 200;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const LINK_VALID_MS = 72 * 60 * 60 * 1000;

/** The one answer to a failed login: unknown e-mail, wrong password, locked or disabled. */
export const LOGIN_FAILED = "E-mail or password is wrong";
/** The one answer to a missing, unknown, expired or revoked session. */
export const LOG_IN_AGAIN = "Please log in again";
/** The one answer to an unknown, used or expired set-password link. */
export const SET_PASSWORD_LINK_INVALID = "This link is no longer valid. Ask the dispatcher for a new one.";
export const HAULIER_BLOCKED = "Your company's access to the portal is blocked. Please call the dispatcher.";

const bad = (message: string) => APIError.invalidArgument(message);

/** An e-mail as stored and looked up: trimmed, lower-cased; null when it is no e-mail. */
export function normaliseEmail(v: unknown): string | null {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Why a password may not be set, or null: at least 12 characters, at most 200, not the e-mail. */
export function passwordRefusal(password: unknown, email: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `The password must have at least ${MIN_PASSWORD} characters`;
  if (password.length > MAX_PASSWORD) return `The password can have at most ${MAX_PASSWORD} characters`;
  if (password.trim().toLowerCase() === email.toLowerCase()) return "The password cannot be your e-mail";
  return null;
}

export const isLocked = (u: Pick<PortalUserRecord, "lockedUntil">, now: Date) => !!u.lockedUntil && u.lockedUntil.getTime() > now.getTime();

/** A new session's expiry and its absolute end. */
export function sessionTimes(now: Date): { expiresAt: Date; absoluteExpiresAt: Date } {
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_MAX_MS);
  return { expiresAt: new Date(Math.min(now.getTime() + SESSION_IDLE_MS, absoluteExpiresAt.getTime())), absoluteExpiresAt };
}

/** The sliding expiry after a request at `now`, never past the absolute end. */
export const slidExpiry = (now: Date, absoluteExpiresAt: Date) => new Date(Math.min(now.getTime() + SESSION_IDLE_MS, absoluteExpiresAt.getTime()));

/** Where the portal's set-password page lives in the web app. */
export const setPasswordUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/haulier/portal/set-password/${token}`;

/** Text of a person's name or phone as stored. */
export function cleanText(v: unknown, what: string, min: number, max: number): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > max) throw bad(min ? `${what} (${min} to ${max} characters)` : `${what} can be at most ${max} characters long`);
  return s;
}

/** How the app shows a portal user: never the hash, the counter or anything of a link. */
export function portalUserItem(u: PortalUserRecord, now: Date): PortalUserItem {
  const status: PortalUserItem["status"] = u.status === "DISABLED" ? "DISABLED" : !u.passwordHash ? "INVITED" : isLocked(u, now) ? "LOCKED" : "ACTIVE";
  return {
    id: u.id,
    haulierCustomerId: u.haulierCustomerId,
    email: u.email,
    name: u.name,
    phone: u.phone,
    status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
