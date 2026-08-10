import { hash, verify } from "@node-rs/argon2";
import { APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { SignJWT, jwtVerify } from "jose";
import { isCompanyRole, isAdminLevel } from "../../../lib/rbac";
import { userRepository } from "../repositories/user.repository";
import { companyRepository } from "../repositories/company.repository";

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
}

class AuthService {
  async login(email: string, password: string): Promise<{ token: string; user: AuthUserInfo }> {
    const found = await userRepository.findByEmail(email.toLowerCase().trim());
    if (!found) {
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
    input: { email: string; password: string; displayName?: string; role?: string },
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
    const passwordHash = await hash(input.password);
    const created = await userRepository.create({
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
    patch: { displayName?: string; role?: string; password?: string },
  ): Promise<AuthUserInfo | null> {
    if (patch.role !== undefined) {
      if (!isAdminLevel(actor.role)) throw APIError.permissionDenied("Only admins can change roles");
      if (!isCompanyRole(patch.role)) throw APIError.invalidArgument("role must be admin, manager or user");
      if (id === actor.userID) throw APIError.invalidArgument("You cannot change your own role");
    }
    const target = await userRepository.getByIdInCompany(id, companyId);
    if (!target) return null;
    if (!isAdminLevel(actor.role) && target.role !== "user") {
      throw APIError.permissionDenied("Managers can only modify standard users");
    }
    const changes: Record<string, unknown> = {};
    if (patch.displayName !== undefined) changes.displayName = patch.displayName;
    if (patch.role !== undefined) changes.role = patch.role;
    if (patch.password) changes.passwordHash = await hash(patch.password);
    const updated = await userRepository.updateInCompany(id, companyId, changes);
    return updated ? this.#toInfo(updated) : null;
  }

  async deactivateUser(id: string, companyId: string, actor: { role: string }): Promise<boolean> {
    const target = await userRepository.getByIdInCompany(id, companyId);
    if (!target) return false;
    if (!isAdminLevel(actor.role) && target.role !== "user") {
      throw APIError.permissionDenied("Managers can only deactivate standard users");
    }
    const deleted = await userRepository.softDeleteInCompany(id, companyId);
    return !!deleted;
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

  async getUserById(id: string): Promise<AuthUserInfo | null> {
    const found = await userRepository.getById(id);
    if (!found) return null;
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

  #toInfo(u: { id: string; companyId: string; email: string; displayName: string; role: string }): AuthUserInfo {
    return { id: u.id, companyId: u.companyId, email: u.email, displayName: u.displayName, role: u.role };
  }

  async #createToken(userId: string, companyId: string, role: string): Promise<string> {
    return new SignJWT({ companyId, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .sign(signingKey());
  }
}

export const authService = new AuthService();
export { companyRepository };
