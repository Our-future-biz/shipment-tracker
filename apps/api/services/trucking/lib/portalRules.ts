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
/** An account's lock doubles with each lock in a row (15 min, 30 min, 1 h), never longer: a stranger knowing the e-mail cannot shut it out for days. */
export const ACCOUNT_MAX_LOCK_MS = 60 * 60 * 1000;
/** Failed logins from one IP (any e-mail, any company) in IP_WINDOW_MS before the IP is locked. */
export const IP_MAX_FAILURES = 20;
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const IP_MAX_LOCK_MS = 24 * 60 * 60 * 1000;
/** A lock that ended longer ago than this starts the progression again. */
export const LOCK_MEMORY_MS = 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const LINK_VALID_MS = 72 * 60 * 60 * 1000;

/** The one answer to a failed login: unknown e-mail, wrong password, locked or disabled. */
export const LOGIN_FAILED = "E-mail or password is wrong";
export const LOGIN_AMBIGUOUS = "This e-mail has portal accounts with more than one company - ask each company to use a different e-mail";
/** The one answer to a missing, unknown, expired or revoked session. */
export const LOG_IN_AGAIN = "Please log in again";
/** The one answer to an unknown, used or expired set-password link. */
export const SET_PASSWORD_LINK_INVALID = "This link is no longer valid. Ask the dispatcher for a new one.";
export const HAULIER_BLOCKED = "Your company's access to the portal is blocked. Please call the dispatcher.";
/** An IP with too many failed logins (it says nothing about any e-mail). */
export const TOO_MANY_ATTEMPTS = "Too many failed logins from your network. Please wait and try again later.";

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

export const isLocked = (u: { lockedUntil: Date | null }, now: Date) => !!u.lockedUntil && u.lockedUntil.getTime() > now.getTime();

/** A login failure counter (an account's or an IP's). */
export interface FailureState {
  failures: number;
  /** When the counting window began (IP); null = counted without a window (account) */
  windowStartedAt: Date | null;
  lockedUntil: Date | null;
  lockLevel: number;
}

export interface FailureRule {
  max: number;
  /** Failures older than this are forgotten; null = kept until a lock or a login */
  windowMs: number | null;
  baseLockMs: number;
  maxLockMs: number;
}

export const ACCOUNT_RULE: FailureRule = { max: MAX_FAILED_LOGINS, windowMs: null, baseLockMs: LOCK_MS, maxLockMs: ACCOUNT_MAX_LOCK_MS };
export const IP_RULE: FailureRule = { max: IP_MAX_FAILURES, windowMs: IP_WINDOW_MS, baseLockMs: LOCK_MS, maxLockMs: IP_MAX_LOCK_MS };

/**
 * The counter after one more failure at `now`. At `max` failures it locks - 15 minutes, doubled
 * for each lock that follows within 24 h of the previous one's end, capped - and counts from 0 again.
 */
export function nextFailure(st: FailureState, now: Date, rule: FailureRule): FailureState {
  const t = now.getTime();
  const windowOver = rule.windowMs !== null && (!st.windowStartedAt || t - st.windowStartedAt.getTime() >= rule.windowMs);
  const failures = (windowOver ? 0 : st.failures) + 1;
  const windowStartedAt = rule.windowMs === null ? null : windowOver ? now : st.windowStartedAt;
  if (failures < rule.max) return { failures, windowStartedAt, lockedUntil: st.lockedUntil, lockLevel: st.lockLevel };
  const recent = !!st.lockedUntil && t - st.lockedUntil.getTime() < LOCK_MEMORY_MS;
  const lockLevel = recent ? st.lockLevel + 1 : 0;
  const ms = Math.min(rule.baseLockMs * 2 ** Math.min(lockLevel, 20), rule.maxLockMs);
  return { failures: 0, windowStartedAt, lockedUntil: new Date(t + ms), lockLevel };
}

/**
 * The client's IP from X-Forwarded-For as the last `trustedHops` proxies saw it: each trusted
 * proxy appends the address it was called from, so the client's own entries (which it may forge)
 * come first and the one our nearest trusted proxy appended is counted from the end. "" when the
 * header has fewer entries (a direct call).
 */
export function clientIp(forwardedFor: string | undefined, trustedHops: number): string {
  const hops = (forwardedFor ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const n = Math.max(1, Math.floor(trustedHops));
  return (hops[hops.length - n] ?? "").slice(0, 100);
}

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
