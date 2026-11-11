import { randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { SignJWT, jwtVerify } from "jose";
import { isLocked, passwordRefusal, throttleKey, type FailureRule } from "../../../lib/loginRules";
import { isCompanyRole, isAdminLevel } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import { constraintOf, isUniqueViolation } from "../../../lib/db/errors";
import { loginThrottleRepository } from "../repositories/loginThrottle.repository";
import { userRepository, type UserPatch } from "../repositories/user.repository";
import { companyRepository } from "../repositories/company.repository";
import type { AdminContact, UserRef } from "../interfaces/interfaces";
import { departmentRepository, branchRepository } from "../repositories/orgUnit.repository";
import { ownCompanyToLookIn, type LookupCaller } from "../lib/selfLookup";

// The signing key comes from the Encore secret store (set via `encore secret set JWT_SECRET`).
// A local-dev fallback keeps `encore run` working without a configured secret, but production
// MUST have the secret set — the fallback is not usable for signing tokens that verify anywhere else.
const jwtSecret = secret("JWT_SECRET");
const TOKEN_EXPIRY = "24h";

// The app login's throttle. Per client IP (any e-mail): 30 failures in 15 minutes lock the IP for
// 15 minutes, doubling up to 24 h - generous, as a whole office may share one address. Per e-mail
// (any IP): 10 failures in 15 minutes lock that e-mail for 15 minutes, doubling up to 1 hour, so a
// stranger who knows an address can't shut its owner out for long.
const LOCK_MS = 15 * 60 * 1000;
const IP_RULE: FailureRule = { max: 30, windowMs: LOCK_MS, baseLockMs: LOCK_MS, maxLockMs: 24 * 60 * 60 * 1000 };
const ACCOUNT_RULE: FailureRule = { max: 10, windowMs: LOCK_MS, baseLockMs: LOCK_MS, maxLockMs: 60 * 60 * 1000 };
const LOGIN_FAILED = "Invalid email or password";
export const TOO_MANY_LOGINS = "Too many failed sign-ins. Please wait a few minutes and try again.";

/** Where a sign-in comes from (see clientIp in lib/loginRules); no IP in local dev. */
export interface LoginClient {
  ip: string;
  ipTrusted: boolean;
}

// An unknown e-mail costs the same argon2 work as a wrong password, so the answer's timing doesn't
// tell which addresses have an account.
let dummyHash: Promise<string> | undefined;
async function burn(password: string): Promise<void> {
  dummyHash ??= hash(randomUUID());
  await verify(await dummyHash, password || "-").catch(() => false);
}

// How long the auth handler trusts what it last read of a user: a deactivation, a new password or
// a role change reaches every request within this time (at once on the instance that made it).
const SESSION_CACHE_MS = 30 * 1000;
interface SessionState {
  companyId: string;
  role: string;
  tokenVersion: number;
}
const sessionCache = new Map<string, { at: number; state: SessionState | null }>();
// The companies a superadmin may work as, by id with their name (null: no such company), re-read like the sessions.
const companyCache = new Map<string, { at: number; name: string | null }>();

/** The company a session works as, and whether it is not the user's own (a superadmin's company switcher). */
export interface WorkingCompany {
  id: string;
  name: string;
  /** A superadmin working as another company than their own. */
  switched: boolean;
}
const forgetSession = (userId: string) => sessionCache.delete(userId);

function assertPassword(password: string, email: string): void {
  const refusal = passwordRefusal(password, email);
  if (refusal) throw APIError.invalidArgument(refusal);
}

function signingKey(): Uint8Array {
  const value = jwtSecret() || process.env.JWT_SECRET;
  if (!value) {
    throw APIError.internal("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(value);
}

export interface AuthUserInfo {
  id: string;
  companyId: string;
  email: string;
  displayName: string;
  role: string;
  departmentId: string | null;
  branchId: string | null;
  /** The manager the user reports to; null for none. */
  reportsToUserId: string | null;
}

// A superadmin's account (password, role, deactivation) is changed only by a superadmin, never by
// an admin of the same company.
export function assertSuperadminTouchedBySuperadmin(targetRole: string, actorRole: string): void {
  if (targetRole === "superadmin" && actorRole !== "superadmin") throw APIError.permissionDenied("Only a superadmin can change a superadmin's account");
}

// The same user: ids compared as the database compares uuids (without regard to case), so an id typed
// in capitals is still the caller's own.
const sameUser = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Nobody deactivates their own account, so a company can't lock out its last admin this way.
export function assertNotSelf(targetId: string, actorId: string): void {
  if (sameUser(targetId, actorId)) throw APIError.invalidArgument("You cannot deactivate your own account");
}

// The domain of the service identities ("Trucking (system)", one per company): no person signs up with it.
const SYSTEM_EMAIL_DOMAIN = "@system.invalid";

/** What #toInfo reads of a user row. */
type UserFields = Pick<AuthUserInfo, "id" | "companyId" | "email" | "displayName" | "role" | "departmentId" | "branchId" | "reportsToUserId">;

/** The signed-in user (login, /auth/me). */
export type SessionUser = AuthUserInfo;

const userNotFound = () => APIError.notFound("User not found");
const EMAIL_TAKEN = "A user with this email already exists";
const SLUG_TAKEN = "A company with this slug already exists";
// Who a user may report to: the company's managers and admins.
const MANAGES: readonly string[] = ["superadmin", "admin", "manager"];

// Org placement of a user; null clears it, undefined leaves it untouched.
interface OrgPlacement {
  departmentId?: string | null;
  branchId?: string | null;
  reportsToUserId?: string | null;
}

class AuthService {
  /**
   * E-mail and password, throttled per e-mail and per client IP (see ACCOUNT_RULE / IP_RULE): a
   * locked bucket refuses even the right password. Every attempt - unknown e-mail included - counts
   * in both and costs the same argon2 work; a successful one is given back.
   */
  async login(email: string, password: string, client: LoginClient = { ip: "", ipTrusted: false }): Promise<{ token: string; user: SessionUser }> {
    const now = new Date();
    const address = email.toLowerCase().trim();
    const accountKey = `acct:${address}`;
    const buckets: [string, FailureRule][] = [[accountKey, ACCOUNT_RULE]];
    const clientKey = throttleKey(client, address);
    if (clientKey) buckets.push([clientKey, IP_RULE]);
    const tooMany = async () => {
      await burn(password);
      return APIError.resourceExhausted(TOO_MANY_LOGINS);
    };
    const counters = await loginThrottleRepository.byKeys(buckets.map(([key]) => key));
    if (counters.some((c) => isLocked(c, now))) throw await tooMany();
    // Every attempt is counted as a failure first, atomically, and given back if the password is
    // right: parallel guesses can't all pass the check above before any failure is recorded, as
    // the attempt that reaches the limit locks the bucket for every one after it.
    const reserved = await Promise.all(buckets.map(([key, rule]) => loginThrottleRepository.fail(key, now, rule)));
    if (reserved.some((c) => isLocked(c, now))) throw await tooMany();
    const found = await userRepository.findByEmail(address);
    // The service identity ("Trucking (system)") never signs in: it has no password.
    if (!found || found.isSystem || !found.passwordHash) {
      await burn(password);
      throw APIError.unauthenticated(LOGIN_FAILED);
    }
    if (!(await verify(found.passwordHash, password).catch(() => false))) throw APIError.unauthenticated(LOGIN_FAILED);
    await Promise.all([loginThrottleRepository.clearFailures(accountKey), ...buckets.filter(([key]) => key !== accountKey).map(([key]) => loginThrottleRepository.giveBack(key))]);
    const token = await this.#createToken(found.id, found.companyId, found.role, found.tokenVersion);
    return {
      token,
      user: await this.#session(found),
    };
  }

  // Creates a user inside the given company. companyId always comes from the caller's
  // token (or the provisioning script), never from client input.
  //
  // Authorization: only admins may assign a role other than "user" — a manager cannot
  // mint admins or other managers (privilege escalation).
  async createUser(
    companyId: string,
    actor: { role: string },
    input: { email: string; password: string; displayName?: string; role?: string } & OrgPlacement,
  ): Promise<AuthUserInfo> {
    const { email, role } = await this.#checkNewUser(actor, input);
    const placement = await this.#checkPlacement(companyId, input);
    const passwordHash = await hash(input.password);
    const created = await userRepository.create({
      ...placement,
      companyId,
      email,
      passwordHash,
      displayName: input.displayName ?? "",
      role,
    } as never);
    return this.#toInfo(created);
  }

  // What a new user is checked for before anything is written (the company's placement apart):
  // the address normalised and still free, the password, and a role the actor may give.
  async #checkNewUser(actor: { role: string }, input: { email: string; password: string; role?: string }): Promise<{ email: string; role: string }> {
    const email = input.email.toLowerCase().trim();
    if (!email || !input.password) {
      throw APIError.invalidArgument("email and password are required");
    }
    assertPassword(input.password, email);
    // Taken by a person, it would stop the company's service identity from being made (ensureSystemUser).
    if (email.endsWith(SYSTEM_EMAIL_DOMAIN)) throw APIError.invalidArgument("This e-mail address is reserved for the system");
    const role = input.role ?? "user";
    // superadmin is never assignable through the API — only the platform provisioning script.
    if (!isCompanyRole(role)) {
      throw APIError.invalidArgument("role must be admin, manager or user");
    }
    if (role !== "user" && !isAdminLevel(actor.role)) {
      throw APIError.permissionDenied("Only admins can assign the admin or manager role");
    }
    if (await userRepository.findByEmail(email)) {
      throw APIError.alreadyExists(EMAIL_TAKEN);
    }
    return { email, role };
  }

  // Authorization rules:
  //  - only admins may change a role (managers cannot escalate anyone);
  //  - no one may change their own role (prevents self-escalation / self-lockout);
  //  - managers may only modify standard users, never admins/managers (blocks a manager
  //    resetting a higher-privileged account's password to take it over).
  async updateUser(
    id: string,
    companyId: string,
    actor: { userID: string; role: string },
    patch: { displayName?: string; role?: string; password?: string } & OrgPlacement,
  ): Promise<AuthUserInfo> {
    if (patch.role !== undefined) {
      if (!isAdminLevel(actor.role)) throw APIError.permissionDenied("Only admins can change roles");
      if (!isCompanyRole(patch.role)) throw APIError.invalidArgument("role must be admin, manager or user");
      if (sameUser(id, actor.userID)) throw APIError.invalidArgument("You cannot change your own role");
    }
    const target = await userRepository.getByIdInCompany(id, companyId);
    if (!target) throw userNotFound();
    if (!isAdminLevel(actor.role) && target.role !== "user") {
      throw APIError.permissionDenied("Managers can only modify standard users");
    }
    assertSuperadminTouchedBySuperadmin(target.role, actor.role);
    const changes: UserPatch = { ...(await this.#checkPlacement(companyId, patch, id)) };
    if (patch.displayName !== undefined) changes.displayName = patch.displayName;
    if (patch.role !== undefined) changes.role = patch.role;
    if (patch.password) {
      assertPassword(patch.password, target.email);
      // A new password also signs the user out everywhere (the repository raises token_version).
      changes.passwordHash = await hash(patch.password);
    }
    const updated = await userRepository.updateInCompany(id, companyId, changes);
    if (!updated) throw userNotFound();
    // A manager made a standard user is no longer whom anybody reports to.
    if (MANAGES.includes(target.role) && !MANAGES.includes(updated.role)) await userRepository.clearReportsTo(companyId, id);
    forgetSession(id);
    return this.#toInfo(updated);
  }

  async deactivateUser(id: string, companyId: string, actor: { userID: string; role: string }): Promise<void> {
    assertNotSelf(id, actor.userID);
    const target = await userRepository.getByIdInCompany(id, companyId);
    if (!target) throw userNotFound();
    if (!isAdminLevel(actor.role) && target.role !== "user") {
      throw APIError.permissionDenied("Managers can only deactivate standard users");
    }
    assertSuperadminTouchedBySuperadmin(target.role, actor.role);
    if (!(await userRepository.softDeleteInCompany(id, companyId))) throw userNotFound();
    // Nobody reports to a user who left: their questions go to the admins at once.
    await userRepository.clearReportsTo(companyId, id);
    forgetSession(id);
  }

  // Platform provisioning: create a company and its first admin in one step.
  // Used by scripts/provision-company.ts (no HTTP surface).
  async provisionCompany(input: {
    companyName: string;
    companySlug: string;
    adminEmail: string;
    adminPassword: string;
    adminName?: string;
  }): Promise<{ companyId: string; admin: AuthUserInfo }> {
    // Everything about the admin is checked before anything is written, and the company and its admin
    // are then created together: a refused e-mail or password never leaves a company without its admin,
    // holding its slug. Platform provisioning acts with admin authority to seat the first admin.
    const displayName = input.adminName ?? "Admin";
    const { email, role } = await this.#checkNewUser({ role: "admin" }, { email: input.adminEmail, password: input.adminPassword, role: "admin" });
    if (await companyRepository.findBySlug(input.companySlug)) {
      throw APIError.alreadyExists(SLUG_TAKEN);
    }
    const passwordHash = await hash(input.adminPassword);
    try {
      const { company, admin } = await companyRepository.createWithAdmin(
        { name: input.companyName, slug: input.companySlug },
        { email, passwordHash, displayName, role },
      );
      return { companyId: company.id, admin: this.#toInfo(admin) };
    } catch (err) {
      // The slug or the e-mail taken between the checks above and the insert (two provisionings at once).
      if (isUniqueViolation(err)) {
        const constraint = constraintOf(err);
        if (constraint === "company_slug_unique") throw APIError.alreadyExists(SLUG_TAKEN);
        if (constraint === "app_user_email_unique") throw APIError.alreadyExists(EMAIL_TAKEN);
      }
      throw err;
    }
  }

  // The signed-in user behind a token; a token of a user since removed is no longer valid.
  async me(token: string): Promise<SessionUser> {
    const { userId, tokenVersion } = await this.verifyToken(token);
    const found = await userRepository.getById(userId);
    if (!found || found.isSystem || found.tokenVersion !== tokenVersion) throw APIError.unauthenticated("User not found");
    return this.#session(found);
  }

  async #session(u: UserFields): Promise<SessionUser> {
    return this.#toInfo(u);
  }

  // Scoped to the caller's company — the users directory never spans companies.
  async listUsers(companyId: string): Promise<AuthUserInfo[]> {
    const rows = await userRepository.listByCompany(companyId);
    return rows.map((u) => this.#toInfo(u));
  }

  /** The token's claims if its signature and expiry hold; a token from before "tv" existed is version 0. */
  async verifyToken(token: string): Promise<{ userId: string; companyId: string; role: string; tokenVersion: number }> {
    try {
      const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
      return {
        userId: payload.sub as string,
        companyId: payload.companyId as string,
        role: payload.role as string,
        tokenVersion: typeof payload.tv === "number" ? payload.tv : 0,
      };
    } catch {
      throw APIError.unauthenticated("Invalid or expired token");
    }
  }

  /**
   * The auth handler's check: a valid token of a user who still exists and whose token version it
   * carries (a new password or a deactivation signs every token out). Role and company come from
   * the user, not the token, so a role change applies without signing in again. The user is read
   * through a 30-second cache.
   */
  async authenticate(token: string): Promise<{ userId: string; companyId: string; role: string }> {
    const claims = await this.verifyToken(token);
    const state = await this.#sessionState(claims.userId);
    if (!state || state.tokenVersion !== claims.tokenVersion) throw APIError.unauthenticated("Invalid or expired token");
    return { userId: claims.userId, companyId: state.companyId, role: state.role };
  }

  /**
   * The company a superadmin chose to work as (the web's company switcher, header X-Acting-Company):
   * every endpoint then reads and writes that company, as one of its users would. Superadmins are
   * the few platform users who may see and change every company. Nobody else can switch: for them
   * the header is ignored. Null without a choice, or for the user's own company; a company that does
   * not exist is refused, so a request never lands in another company than the one chosen.
   */
  async actingCompany(role: string, homeCompanyId: string, chosen: string | undefined): Promise<string | null> {
    const id = (chosen ?? "").trim().toLowerCase();
    if (role !== "superadmin" || !id || id === homeCompanyId.toLowerCase()) return null;
    if (!isUuid(id) || (await this.#companyName(id)) === null) {
      throw APIError.invalidArgument("The company chosen to work as does not exist - choose another in the header");
    }
    return id;
  }

  /** The company the user works as: their own, or for a superadmin the one chosen (unknown → their own). */
  async workingCompany(user: SessionUser, chosen: string | undefined): Promise<WorkingCompany> {
    const id = (chosen ?? "").trim().toLowerCase();
    const switched = user.role === "superadmin" && !!id && id !== user.companyId.toLowerCase() && isUuid(id);
    const name = switched ? await this.#companyName(id) : null;
    if (switched && name !== null) return { id, name, switched: true };
    return { id: user.companyId, name: (await this.#companyName(user.companyId)) ?? "", switched: false };
  }

  async #companyName(companyId: string): Promise<string | null> {
    const now = Date.now();
    const cached = companyCache.get(companyId);
    if (cached && now - cached.at < SESSION_CACHE_MS) return cached.name;
    const row = await companyRepository.getById(companyId);
    const name = row?.name ?? null;
    if (companyCache.size >= 1_000) companyCache.clear();
    companyCache.set(companyId, { at: now, name });
    return name;
  }

  async #sessionState(userId: string): Promise<SessionState | null> {
    const now = Date.now();
    const cached = sessionCache.get(userId);
    if (cached && now - cached.at < SESSION_CACHE_MS) return cached.state;
    const row = await userRepository.sessionState(userId);
    const state = row && !row.isSystem ? { companyId: row.companyId, role: row.role, tokenVersion: row.tokenVersion } : null;
    // A bound on memory; every entry is re-read within 30 s anyway.
    if (sessionCache.size >= 10_000) sessionCache.clear();
    sessionCache.set(userId, { at: now, state });
    return state;
  }

  // A user can only be placed in a department/branch of their own company.
  async #checkPlacement(companyId: string, input: OrgPlacement, userId?: string): Promise<OrgPlacement> {
    const placement: OrgPlacement = {};
    if (input.departmentId !== undefined) {
      if (input.departmentId && !(await departmentRepository.getByIdForCompany(input.departmentId, companyId))) {
        throw APIError.invalidArgument("Unknown department");
      }
      placement.departmentId = input.departmentId || null;
    }
    if (input.branchId !== undefined) {
      if (input.branchId && !(await branchRepository.getByIdForCompany(input.branchId, companyId))) {
        throw APIError.invalidArgument("Unknown branch");
      }
      placement.branchId = input.branchId || null;
    }
    if (input.reportsToUserId !== undefined) {
      let reportsTo: string | null = null;
      if (input.reportsToUserId) {
        if (!isUuid(input.reportsToUserId)) throw APIError.invalidArgument("Reports to must be a user id");
        const manager = await userRepository.getByIdInCompany(input.reportsToUserId, companyId);
        if (!manager || !MANAGES.includes(manager.role)) throw APIError.invalidArgument("Reports to must be a manager or admin of the company");
        // Compared as the database found them: an id in other letters is still the same user.
        if (manager.id === userId) throw APIError.invalidArgument("A user cannot report to themselves");
        reportsTo = manager.id;
      }
      placement.reportsToUserId = reportsTo;
    }
    return placement;
  }

  #toInfo(u: UserFields): AuthUserInfo {
    return {
      id: u.id,
      companyId: u.companyId,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      departmentId: u.departmentId,
      branchId: u.branchId,
      reportsToUserId: u.reportsToUserId,
    };
  }

  async #createToken(userId: string, companyId: string, role: string, tokenVersion: number): Promise<string> {
    return new SignJWT({ companyId, role, tv: tokenVersion })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .sign(signingKey());
  }

  /**
   * Admins of every company, each with their company and role: the ČNB rates are shared by all
   * companies, so a missing fixing concerns all of them - but each company is written to apart.
   * Internal only — never exposed to the web.
   */
  async adminContacts(): Promise<AdminContact[]> {
    return userRepository.listAdmins();
  }

  /**
   * The company's service identity ("Trucking (system)", role user), created on first use: what
   * the system or a haulier causes in other services is sent as this user, so it never fails
   * because a staff user left. It cannot sign in and is not listed.
   */
  async serviceUser(companyId: string): Promise<string> {
    return userRepository.ensureSystemUser(companyId);
  }

  /** Live users of the company among `ids` (deactivated or unknown ids are left out); the service identity is named "Trucking (system)". */
  async userRefs(companyId: string, ids: string[]): Promise<UserRef[]> {
    const rows = await userRepository.listByIdsInCompany([...new Set(ids)], companyId);
    return rows.map((u) => ({ id: u.id, name: u.displayName || u.email || "", email: u.email, role: u.role }));
  }

  /**
   * userRefs in the company the request works in, and the caller themself from their own company when a
   * superadmin works as another one: for a stamp of who did something (created by, decided by). Nobody
   * else is looked up outside the acting company (lib/selfLookup).
   */
  async userRefsWithSelf(caller: LookupCaller, ids: string[]): Promise<UserRef[]> {
    const refs = await this.userRefs(caller.companyID, ids);
    const own = ownCompanyToLookIn(caller, ids, refs);
    return own ? [...refs, ...(await this.userRefs(own, [caller.userID]))] : refs;
  }

  /**
   * userRefs in the company, and of the ids not found there the live superadmins (with their own
   * company): who a write owed by an outbox row is made as. A superadmin working as the company
   * (X-Acting-Company) caused it there, though their record is in their own company; anybody else
   * outside the company is nobody here.
   */
  async actorRefs(companyId: string, ids: string[]): Promise<UserRef[]> {
    const refs = await this.userRefs(companyId, ids);
    const missing = [...new Set(ids)].filter((id) => !refs.some((u) => u.id === id));
    const supers = await userRepository.listLiveSuperadminsByIds(missing);
    return [
      ...refs,
      ...supers.map((u) => ({ id: u.id, name: u.displayName || u.email || "", email: u.email, role: u.role, homeCompanyId: u.companyId })),
    ];
  }
}

export const authService = new AuthService();
export { companyRepository };
