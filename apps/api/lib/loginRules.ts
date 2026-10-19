// Shared login rules: password policy, the failed-login throttle and the client IP behind our
// proxies. Used by the app login (auth) and the haulier portal (trucking). Pure.

/**
 * How many proxies in front of the API append to X-Forwarded-For. Assumption: on Encore Cloud the
 * Google load balancer appends "<client>, <load balancer>", so the client is the second entry from
 * the right. With fewer entries the leftmost one is used, so a short header can't turn the throttle
 * off. Only a request with no header at all (local dev) has no IP. If entries left of the trusted
 * ones are client-written, a client can rotate its per-IP bucket - the per-account counters still
 * cap guessing per account. Verify the hop count against the logged header length in the cloud.
 */
export const TRUSTED_PROXY_HOPS = 2;

export const MIN_PASSWORD = 12;
/** argon2 hashes whatever it is given: a cap keeps a huge "password" from costing the server. */
export const MAX_PASSWORD = 200;

/** Why a password may not be set, or null: at least 12 characters, at most 200, not the e-mail. */
export function passwordRefusal(password: unknown, email: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `The password must have at least ${MIN_PASSWORD} characters`;
  if (password.length > MAX_PASSWORD) return `The password can have at most ${MAX_PASSWORD} characters`;
  if (password.trim().toLowerCase() === email.toLowerCase()) return "The password cannot be your e-mail";
  return null;
}

/** A lock that ended longer ago than this starts the progression again. */
export const LOCK_MEMORY_MS = 24 * 60 * 60 * 1000;

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
export function clientIp(forwardedFor: string | undefined, trustedHops: number): { ip: string; trusted: boolean } {
  const hops = (forwardedFor ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!hops.length) return { ip: "", trusted: false };
  const n = Math.max(1, Math.floor(trustedHops));
  // Fewer entries than proxies expected: the leftmost one there is, but not trusted as the client's
  // own address (it may be a proxy that every user shares).
  return { ip: hops[Math.max(0, hops.length - n)]!.slice(0, 100), trusted: hops.length >= n };
}

/**
 * The login throttle bucket. A trusted client IP gets its own bucket. An untrusted one (a header
 * shorter than expected) is combined with the e-mail, so an address all users may share can never
 * lock the login for everybody, and a short header still never turns the throttle off. No IP at
 * all (local dev): the e-mail alone. Null only without an e-mail (nothing to log in as).
 */
export function throttleKey(client: { ip: string; ipTrusted: boolean }, email: string): string | null {
  if (client.ip && client.ipTrusted) return `ip:${client.ip}`;
  if (!email) return null;
  return client.ip ? `ipmail:${client.ip}|${email}` : `mail:${email}`;
}
