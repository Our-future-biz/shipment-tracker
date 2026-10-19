import { randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { SignJWT, jwtVerify } from "jose";
import { isLocked, passwordRefusal, throttleKey, type FailureRule } from "../../../lib/loginRules";
import { isCompanyRole, isAdminLevel } from "../../../lib/rbac";
import { loginThrottleRepository } from "../repositories/loginThrottle.repository";
import { userRepository, type UserPatch } from "../repositories/user.repository";
import { companyRepository } from "../repositories/company.repository";
import type { AdminContact, UserRef } from "../interfaces/interfaces";
import { departmentRepository, branchRepository } from "../repositories/orgUnit.repository";

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
}

// A superadmin's account (password, role, deactivation) is changed only by a superadmin, never by
// an admin of the same company.
export function assertSuperadminTouchedBySuperadmin(targetRole: string, actorRole: string): void {
  if (targetRole === "superadmin" && actorRole !== "superadmin") throw APIError.permissionDenied("Only a superadmin can change a superadmin's account");
}

// Nobody deactivates their own account, so a company can't lock out its last admin this way.
export function assertNotSelf(targetId: string, actorId: string): void {
  if (targetId === actorId) throw APIError.invalidArgument("You cannot deactivate your own account");
}

/** What #toInfo reads of a user row. */
type UserFields = Pick<AuthUserInfo, "id" | "companyId" | "email" | "displayName" | "role" | "departmentId" | "branchId">;

/** The signed-in user (login, /auth/me). */
export type SessionUser = AuthUserInfo;

const userNotFound = () => APIError.notFound("User not found");

// Org placement of a user; null clears it, undefined leaves it untouched.
interface OrgPlacement {
  departmentId?: string | null;
  branchId?: string | null;
}

class AuthService {
  /**
   * E-mail and password, throttled per e-mail and per client IP (see ACCOUNT_RULE / IP_RULE): a
   * locked bucket refuses even the right password. Every failure - unknown e-mail included -
   * counts in both and costs the same argon2 work.
   */
  async login(email: string, password: string, client: LoginClient = { ip: "", ipTrusted: false }): Promise<{ token: string; user: SessionUser }> {
    const now = new Date();
    const address = email.toLowerCase().trim();
    const accountKey = `acct:${address}`;
    const buckets: [string, FailureRule][] = [[accountKey, ACCOUNT_RULE]];
    const clientKey = throttleKey(client, address);
    if (clientKey) buckets.push([clientKey, IP_RULE]);
    const counters = await loginThrottleRepository.byKeys(buckets.map(([key]) => key));
    if (counters.some((c) => isLocked(c, now))) {
      await burn(password);
      throw APIError.resourceExhausted(TOO_MANY_LOGINS);
    }
    const failed = async () => {
      for (const [key, rule] of buckets) await loginThrottleRepository.fail(key, now, rule);
      return APIError.unauthenticated(LOGIN_FAILED);
    };
    const found = await userRepository.findByEmail(address);
    // The service identity ("Trucking (system)") never signs in: it has no password.
    if (!found || found.isSystem || !found.passwordHash) {
      await burn(password);
      throw await failed();
    }
    if (!(await verify(found.passwordHash, password).catch(() => false))) throw await failed();
    await loginThrottleRepository.clearFailures(accountKey);
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
    const email = input.email.toLowerCase().trim();
    if (!email || !input.password) {
      throw APIError.invalidArgument("email and password are required");
    }
    assertPassword(input.password, email);
    const role = input.role ?? "user";
    // superadmin is never assignable through the API — only the platform provisioning script.
    if (!isCompanyRole(role)) {
      throw APIError.invalidArgument("role must be admin, manager or user");
    }
    if (role !== "user" && !isAdminLevel(actor.role)) {
      throw APIError.permissionDenied("Only admins can assign the admin or manager role");
    }
    if (await userRepository.findByEmail(email)) {
      throw APIError.alreadyExists("A user with this email already exists");
    }
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
      if (id === actor.userID) throw APIError.invalidArgument("You cannot change your own role");
    }
    const target = await userRepository.getByIdInCompany(id, companyId);
    if (!target) throw userNotFound();
    if (!isAdminLevel(actor.role) && target.role !== "user") {
      throw APIError.permissionDenied("Managers can only modify standard users");
    }
    assertSuperadminTouchedBySuperadmin(target.role, actor.role);
    const changes: UserPatch = { ...(await this.#checkPlacement(companyId, patch)) };
    if (patch.displayName !== undefined) changes.displayName = patch.displayName;
    if (patch.role !== undefined) changes.role = patch.role;
    if (patch.password) {
      assertPassword(patch.password, target.email);
      // A new password also signs the user out everywhere (the repository raises token_version).
      changes.passwordHash = await hash(patch.password);
    }
    const updated = await userRepository.updateInCompany(id, companyId, changes);
    if (!updated) throw userNotFound();
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
    // Checked before anything is created: a refused password must not leave a company without its admin.
    assertPassword(input.adminPassword, input.adminEmail.toLowerCase().trim());
    if (await companyRepository.findBySlug(input.companySlug)) {
      throw APIError.alreadyExists("A company with this slug already exists");
    }
    const company = await companyRepository.create({
      name: input.companyName,
      slug: input.companySlug,
    } as never);
    // Platform provisioning acts with admin authority to seat the first admin.
    const admin = await this.createUser(company.id, { role: "admin" }, {
      email: input.adminEmail,
      password: input.adminPassword,
      displayName: input.adminName ?? "Admin",
      role: "admin",
    });
    return { companyId: company.id, admin };
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
  async #checkPlacement(companyId: string, input: OrgPlacement): Promise<OrgPlacement> {
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
   * Admins of every company: the ČNB rates are shared by all companies, so a missing
   * fixing concerns all of them. Internal only — never exposed to the web.
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
    return rows.map((u) => ({ id: u.id, name: u.displayName || u.email || "", role: u.role }));
  }
}

export const authService = new AuthService();
export { companyRepository };
