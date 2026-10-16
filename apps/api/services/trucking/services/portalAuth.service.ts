import { hash, verify } from "@node-rs/argon2";
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { auth, customers } from "~encore/clients";
import { db, inTx } from "../db/db";
import { portalRepository } from "../repositories/portal.repository";
import { haulierRepository } from "../repositories/haulier.repository";
import { appendEvent } from "../repositories/event.repository";
import type { PortalSessionRecord, PortalUserRecord } from "../schemas/portal.schema";
import type { PortalMe } from "../interfaces/portal.interfaces";
import { hashToken, looksLikeToken, newToken, tokenMatches } from "../lib/haulierToken";
import {
  ACCOUNT_RULE,
  HAULIER_BLOCKED,
  IP_RULE,
  isLocked,
  LOG_IN_AGAIN,
  LOGIN_AMBIGUOUS,
  LOGIN_FAILED,
  MAX_PASSWORD,
  normaliseEmail,
  passwordRefusal,
  SET_PASSWORD_LINK_INVALID,
  sessionTimes,
  slidExpiry,
  TOO_MANY_ATTEMPTS,
} from "../lib/portalRules";
import { ourCompany } from "./transportOrder.service";
import { serviceActor } from "../../../lib/outbox/serviceIdentity";
import { moduleHidden } from "../../../lib/modules";

// The haulier portal's own login, separate from the app's: e-mail + password (argon2id, the
// parameters the app's login uses), a session token of 32 random bytes of which only the SHA-256
// is stored, compared in constant time. Every portal endpoint is `auth: false` and comes through
// `authenticate`; the app's Encore auth token is never looked at. Unknown e-mail, wrong password,
// locked and disabled all get the same answer, after the same argon2 work.

/** Who calls a portal endpoint: the portal user, the haulier and the company they belong to. */
export interface PortalCaller {
  session: PortalSessionRecord;
  user: PortalUserRecord;
  companyId: string;
  haulierId: string;
  /** How the portal user is named in stamps and the history: "Eva Malá (haulier)" */
  who: string;
}

/** Where the login comes from (stored with the session). */
export interface PortalClient {
  ip: string;
  userAgent: string;
}

/**
 * The identity internal calls of the portal are made as: the company's service identity
 * ("Trucking (system)", the least role), so nothing fails once the app user who invited the
 * portal user leaves. The portal user never has an app identity of their own.
 */
export const actingFor = (u: Pick<PortalUserRecord, "companyId">) => serviceActor(u.companyId);

let dummy: Promise<string> | null = null;
/** The same argon2 work as a real check, for an e-mail that has no password to check. */
async function burn(password: string): Promise<void> {
  dummy ??= hash(newToken().token);
  await verify(await dummy, password || "-").catch(() => false);
}

const event = (u: PortalUserRecord, kind: "portal_login" | "portal_login_failed" | "portal_logout" | "portal_password_set", summary: string, facts: Record<string, unknown> = {}) => ({
  kind,
  customerId: u.haulierCustomerId,
  byUserId: null,
  byName: `${u.name} (haulier)`,
  payload: { changes: {}, summary, facts: { portalUserId: u.id, ...facts } },
});

class PortalAuthService {
  /** Whether the haulier is blocked (Phase 1 block): the portal is closed to its users. */
  async haulierBlocked(companyId: string, haulierId: string): Promise<boolean> {
    return (await haulierRepository.find(companyId, haulierId))?.profile.blocked ?? false;
  }

  /**
   * The caller of a portal endpoint from its X-Portal-Session header. A missing, malformed,
   * unknown, expired or revoked session - and a disabled user - get the same 401. A blocked
   * haulier ends its users' sessions and is told so. Slides the session's expiry.
   */
  async authenticate(token: unknown): Promise<PortalCaller> {
    const again = () => APIError.unauthenticated(LOG_IN_AGAIN);
    if (!looksLikeToken(token)) throw again();
    const session = await portalRepository.sessionByHash(hashToken(token));
    const now = new Date();
    if (!session || !tokenMatches(session.tokenHash, token) || session.revokedAt) throw again();
    if (session.expiresAt.getTime() <= now.getTime() || session.absoluteExpiresAt.getTime() <= now.getTime()) throw again();
    // A company that hides Trucking has no portal: its sessions answer like an unknown one.
    if (await moduleHidden(session.companyId, "trucking_concept")) throw again();
    const user = await portalRepository.findUser(session.companyId, session.userId);
    if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
      await portalRepository.revokeSessionsOf(db, session.companyId, [session.userId]);
      throw again();
    }
    if (await this.haulierBlocked(user.companyId, user.haulierCustomerId)) {
      await portalRepository.revokeSessionsOfHaulier(user.companyId, user.haulierCustomerId);
      throw APIError.permissionDenied(HAULIER_BLOCKED);
    }
    await portalRepository.touchSession(session.id, now, slidExpiry(now, session.absoluteExpiresAt));
    return { session, user, companyId: user.companyId, haulierId: user.haulierCustomerId, who: `${user.name} (haulier)` };
  }

  /**
   * E-mail and password. Throttled twice: per IP (20 failed logins in 15 minutes, any e-mail or
   * company, lock the IP - 15 minutes doubling up to 24 h - answered "too many attempts") and per
   * account (5 wrong passwords lock it - 15 minutes doubling up to 1 hour; a right password is
   * refused too while locked). One e-mail may have an account in several companies: the password
   * is checked against each usable one and the account it matches logs in - the others are not
   * charged a failure; a failure counts only when no account matched, and only on the accounts
   * actually tried. A matching account of a blocked haulier does not stop another match. Every
   * attempt on a known e-mail is an event; an unknown e-mail is only logged.
   */
  async login(input: { email: unknown; password: unknown }, client: PortalClient): Promise<{ session: string; expiresAt: string; me: PortalMe }> {
    const fail = () => APIError.unauthenticated(LOGIN_FAILED);
    const now = new Date();
    // An unknown client IP is not throttled per IP (one shared bucket would let anyone lock the
    // portal for everybody); the per-account lockout still applies.
    const ipKey = client.ip ? `ip:${client.ip}` : null;
    const failed = async () => {
      if (ipKey) await portalRepository.failThrottle(ipKey, now, IP_RULE);
      return fail();
    };
    const email = normaliseEmail(input.email);
    const password = typeof input.password === "string" ? input.password : "";
    const throttle = ipKey ? await portalRepository.throttleOf(ipKey) : null;
    if (throttle && isLocked(throttle, now)) {
      await burn(password);
      log.info("trucking portal: login refused, too many failures from the IP");
      throw APIError.resourceExhausted(TOO_MANY_ATTEMPTS);
    }
    if (!email || !password || password.length > MAX_PASSWORD) {
      await burn("");
      throw await failed();
    }
    // Accounts of a company that hides Trucking count as unknown (that company has no portal).
    const accounts = await portalRepository.usersByEmail(email);
    const hidden = await Promise.all(accounts.map((u) => moduleHidden(u.companyId, "trucking_concept")));
    const candidates = accounts.filter((_, n) => !hidden[n]);
    if (!candidates.length) {
      await burn(password);
      log.info("trucking portal: login with an unknown e-mail refused");
      throw await failed();
    }
    const tried: PortalUserRecord[] = [];
    const matched: PortalUserRecord[] = [];
    for (const u of candidates) {
      const refused = isLocked(u, now) ? "locked" : u.status !== "ACTIVE" ? "disabled" : !u.passwordHash ? "password_not_set" : null;
      if (refused || !u.passwordHash) {
        await burn(password);
        await appendEvent(db, u.companyId, event(u, "portal_login_failed", `Portal login refused (${refused})`, { reason: refused }));
        continue;
      }
      if (await verify(u.passwordHash, password).catch(() => false)) matched.push(u);
      else tried.push(u);
    }
    const usable: PortalUserRecord[] = [];
    for (const u of matched) {
      if (await this.haulierBlocked(u.companyId, u.haulierCustomerId)) {
        await appendEvent(db, u.companyId, event(u, "portal_login_failed", "Portal login refused: the haulier is blocked", { reason: "blocked" }));
        continue;
      }
      usable.push(u);
    }
    // The same e-mail and password in two companies' portals: which company is meant can't be told,
    // so neither is logged in (the user asks one company for a different e-mail).
    if (usable.length > 1) {
      for (const u of usable) {
        await appendEvent(db, u.companyId, event(u, "portal_login_failed", "Portal login refused: the e-mail has accounts with more than one company", { reason: "ambiguous" }));
      }
      throw APIError.failedPrecondition(LOGIN_AMBIGUOUS);
    }
    if (usable.length === 1) return this.startSession(usable[0]!, now, client);
    if (matched.length) throw APIError.permissionDenied(HAULIER_BLOCKED);
    for (const u of tried) {
      const row = await portalRepository.failLogin(u.companyId, u.id, now, ACCOUNT_RULE);
      const lockedNow = !!row && isLocked(row, now);
      const minutes = row?.lockedUntil ? Math.round((row.lockedUntil.getTime() - now.getTime()) / 60_000) : 0;
      await appendEvent(db, u.companyId, event(u, "portal_login_failed", `Portal login: wrong password${lockedNow ? `, locked for ${minutes} minutes` : ""}`, { reason: "wrong_password", locked: lockedNow }));
    }
    throw await failed();
  }

  private async startSession(u: PortalUserRecord, now: Date, client: PortalClient) {
    const { token, hash: tokenHash } = newToken();
    const times = sessionTimes(now);
    await inTx(async (tx) => {
      await portalRepository.updateUser(tx, u.companyId, u.id, { failedAttempts: 0, lockedUntil: null, lockLevel: 0, lastLoginAt: now });
      await portalRepository.insertSession(tx, {
        companyId: u.companyId,
        userId: u.id,
        tokenHash,
        createdAt: now,
        lastSeenAt: now,
        ...times,
        ip: client.ip.slice(0, 100),
        userAgent: client.userAgent.slice(0, 300),
      });
      await appendEvent(tx, u.companyId, event(u, "portal_login", "Logged in to the haulier portal"));
    });
    return { session: token, expiresAt: times.expiresAt.toISOString(), me: await this.me(u) };
  }

  async logout(caller: PortalCaller): Promise<void> {
    await inTx(async (tx) => {
      await portalRepository.revokeSession(tx, caller.session.id);
      await appendEvent(tx, caller.companyId, event(caller.user, "portal_logout", "Logged out of the haulier portal"));
    });
  }

  /** The portal user, their haulier and our company as printed (names only; "" when not readable). */
  async me(u: PortalUserRecord): Promise<PortalMe> {
    const authData = await actingFor(u);
    const [haulierName, our] = await Promise.all([
      customers
        ._internalHaulierList({ ids: [u.haulierCustomerId] }, { authData })
        .then((r) => r.hauliers.find((h) => h.id === u.haulierCustomerId)?.companyName ?? "")
        .catch((err: unknown) => {
          log.warn(err, "trucking portal: haulier name not read");
          return "";
        }),
      ourCompany(authData),
    ]);
    // A company with no invoicing or quotation details yet still shows its registered name.
    const ourName =
      our.name ||
      (await auth._internalCompanyName({ authData }).then((r) => r.name).catch((err: unknown) => {
        log.warn(err, "trucking portal: company name not read");
        return "";
      }));
    return { userName: u.name, email: u.email, haulierName, ourCompany: ourName };
  }

  /**
   * Sets the password through a one-time link (invitation or reset): the link must be live, not
   * used and of a user who is not disabled - else the same 404. A password that breaks the rules
   * leaves the link usable. Ends the user's sessions and lifts a lock.
   */
  async setPassword(input: { token: unknown; password: unknown }): Promise<void> {
    const invalid = () => APIError.notFound(SET_PASSWORD_LINK_INVALID);
    const token = input.token;
    if (!looksLikeToken(token)) throw invalid();
    const link = await portalRepository.tokenByHash(hashToken(token));
    const now = new Date();
    if (!link || !tokenMatches(link.tokenHash, token) || link.usedAt || link.expiresAt.getTime() <= now.getTime()) throw invalid();
    if (await moduleHidden(link.companyId, "trucking_concept")) throw invalid();
    const user = await portalRepository.findUser(link.companyId, link.userId);
    if (!user || user.status !== "ACTIVE") throw invalid();
    const refusal = passwordRefusal(input.password, user.email);
    if (refusal) throw APIError.invalidArgument(refusal);
    const passwordHash = await hash(input.password as string);
    await inTx(async (tx) => {
      if (!(await portalRepository.useToken(tx, link.id, now))) throw invalid();
      await portalRepository.updateUser(tx, user.companyId, user.id, { passwordHash, failedAttempts: 0, lockedUntil: null, lockLevel: 0 });
      await portalRepository.revokeSessionsOf(tx, user.companyId, [user.id]);
      await appendEvent(tx, user.companyId, event(user, "portal_password_set", link.kind === "INVITE" ? "Portal password set (invitation)" : "Portal password set (reset)", { kind: link.kind }));
    });
  }
}

export const portalAuthService = new PortalAuthService();
