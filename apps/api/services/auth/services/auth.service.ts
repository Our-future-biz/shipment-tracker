import { hash, verify } from "@node-rs/argon2";
import { APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { SignJWT, jwtVerify } from "jose";
import { isCompanyRole, isAdminLevel } from "../../../lib/rbac";
import { userRepository, type UserPatch } from "../repositories/user.repository";
import { companyRepository } from "../repositories/company.repository";
import type { AdminContact, UserRef } from "../interfaces/interfaces";
import { departmentRepository, branchRepository } from "../repositories/orgUnit.repository";

// The signing key comes from the Encore secret store (set via `encore secret set JWT_SECRET`).
// A local-dev fallback keeps `encore run` working without a configured secret, but production
// MUST have the secret set — the fallback is not usable for signing tokens that verify anywhere else.
const jwtSecret = secret("JWT_SECRET");
const TOKEN_EXPIRY = "24h";

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

// Nobody deactivates their own account, so a company can't lock out its last admin this way.
export function assertNotSelf(targetId: string, actorId: string): void {
  if (targetId === actorId) throw APIError.invalidArgument("You cannot deactivate your own account");
}

const userNotFound = () => APIError.notFound("User not found");

// Org placement of a user; null clears it, undefined leaves it untouched.
interface OrgPlacement {
  departmentId?: string | null;
  branchId?: string | null;
}

class AuthService {
  async login(email: string, password: string): Promise<{ token: string; user: AuthUserInfo }> {
    const found = await userRepository.findByEmail(email.toLowerCase().trim());
    // The service identity ("Trucking (system)") never signs in: it has no password.
    if (!found || found.isSystem || !found.passwordHash) {
      throw APIError.unauthenticated("Invalid email or password");
    }
    const valid = await verify(found.passwordHash, password);
    if (!valid) {
      throw APIError.unauthenticated("Invalid email or password");
    }
    const token = await this.#createToken(found.id, found.companyId, found.role);
    return {
      token,
      user: this.#toInfo(found),
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
    const changes: UserPatch = { ...(await this.#checkPlacement(companyId, patch)) };
    if (patch.displayName !== undefined) changes.displayName = patch.displayName;
    if (patch.role !== undefined) changes.role = patch.role;
    if (patch.password) changes.passwordHash = await hash(patch.password);
    const updated = await userRepository.updateInCompany(id, companyId, changes);
    if (!updated) throw userNotFound();
    return this.#toInfo(updated);
  }

  async deactivateUser(id: string, companyId: string, actor: { userID: string; role: string }): Promise<void> {
    assertNotSelf(id, actor.userID);
    const target = await userRepository.getByIdInCompany(id, companyId);
    if (!target) throw userNotFound();
    if (!isAdminLevel(actor.role) && target.role !== "user") {
      throw APIError.permissionDenied("Managers can only deactivate standard users");
    }
    if (!(await userRepository.softDeleteInCompany(id, companyId))) throw userNotFound();
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
  async me(token: string): Promise<AuthUserInfo> {
    const { userId } = await this.verifyToken(token);
    const found = await userRepository.getById(userId);
    if (!found || found.isSystem) throw APIError.unauthenticated("User not found");
    return this.#toInfo(found);
  }

  // Scoped to the caller's company — the users directory never spans companies.
  async listUsers(companyId: string): Promise<AuthUserInfo[]> {
    const rows = await userRepository.listByCompany(companyId);
    return rows.map((u) => this.#toInfo(u));
  }

  async verifyToken(token: string): Promise<{ userId: string; companyId: string; role: string }> {
    try {
      const { payload } = await jwtVerify(token, signingKey());
      return {
        userId: payload.sub as string,
        companyId: payload.companyId as string,
        role: payload.role as string,
      };
    } catch {
      throw APIError.unauthenticated("Invalid or expired token");
    }
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

  #toInfo(u: {
    id: string;
    companyId: string;
    email: string;
    displayName: string;
    role: string;
    departmentId: string | null;
    branchId: string | null;
  }): AuthUserInfo {
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

  async #createToken(userId: string, companyId: string, role: string): Promise<string> {
    return new SignJWT({ companyId, role })
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
