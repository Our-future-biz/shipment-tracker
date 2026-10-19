import { describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; the service's repositories and secret are stubbed.
vi.mock("encore.dev/api", () => ({
  APIError: {
    invalidArgument: (msg: string) => new Error(msg),
    notFound: (msg: string) => new Error(msg),
    permissionDenied: (msg: string) => new Error(msg),
    unauthenticated: (msg: string) => new Error(msg),
    resourceExhausted: (msg: string) => new Error(msg),
  },
}));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("~encore/auth", () => ({ getAuthData: () => null }));
const users = vi.hoisted(() => ({
  getByIdInCompany: vi.fn(),
  softDeleteInCompany: vi.fn(),
  findByEmail: vi.fn(),
  getById: vi.fn(),
  ensureSystemUser: vi.fn(async () => "svc-1"),
  sessionState: vi.fn(),
  updateInCompany: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../repositories/user.repository", () => ({ userRepository: users }));
const companies = vi.hoisted(() => ({ getById: vi.fn(async () => null) }));
vi.mock("../repositories/company.repository", () => ({ companyRepository: companies }));
vi.mock("../repositories/orgUnit.repository", () => ({ departmentRepository: {}, branchRepository: {} }));
const throttle = vi.hoisted(() => ({ byKeys: vi.fn(async () => [] as { key: string; lockedUntil: Date | null }[]), fail: vi.fn(), clearFailures: vi.fn() }));
vi.mock("../repositories/loginThrottle.repository", () => ({ loginThrottleRepository: throttle }));

import { hash } from "@node-rs/argon2";
import { assertNotSelf, authService, TOO_MANY_LOGINS } from "../services/auth.service";

describe("deactivating users", () => {
  it("never lets someone deactivate their own account", async () => {
    expect(() => assertNotSelf("u1", "u1")).toThrow("You cannot deactivate your own account");
    expect(() => assertNotSelf("u2", "u1")).not.toThrow();
    await expect(authService.deactivateUser("u1", "c1", { userID: "u1", role: "admin" })).rejects.toThrow("own account");
    expect(users.getByIdInCompany).not.toHaveBeenCalled();
  });

  it("reports a user of another company as not found", async () => {
    users.getByIdInCompany.mockResolvedValue(null);
    await expect(authService.deactivateUser("u2", "c1", { userID: "u1", role: "admin" })).rejects.toThrow("User not found");
  });

  it("lets managers deactivate only standard users", async () => {
    users.getByIdInCompany.mockResolvedValue({ id: "u2", role: "admin" });
    await expect(authService.deactivateUser("u2", "c1", { userID: "u1", role: "manager" })).rejects.toThrow("standard users");
  });
});

describe("the service identity (Trucking (system))", () => {
  const system = { id: "svc-1", companyId: "c1", email: "trucking-system+c1@system.invalid", passwordHash: "", displayName: "Trucking (system)", role: "user", isSystem: true };

  it("never signs in, whatever password is typed", async () => {
    users.findByEmail.mockResolvedValue(system);
    await expect(authService.login(system.email, "anything")).rejects.toThrow("Invalid email or password");
    await expect(authService.login(system.email, "")).rejects.toThrow("Invalid email or password");
  });

  it("has no valid session either", async () => {
    vi.spyOn(authService, "verifyToken").mockResolvedValueOnce({ userId: "svc-1", companyId: "c1", role: "user", tokenVersion: 0 });
    users.getById.mockResolvedValue(system);
    await expect(authService.me("token")).rejects.toThrow("User not found");
  });

  it("is created on demand for the caller's company", async () => {
    expect(await authService.serviceUser("c1")).toBe("svc-1");
    expect(users.ensureSystemUser).toHaveBeenCalledWith("c1");
  });
});

describe("signing in: the failed-login throttle", () => {
  const office = { ip: "203.0.113.7", ipTrusted: true };

  it("counts an unknown e-mail as a failure of the e-mail and of the IP, with the usual answer", async () => {
    throttle.fail.mockClear();
    users.findByEmail.mockResolvedValue(null);
    await expect(authService.login(" Nobody@Example.com ", "whatever-password", office)).rejects.toThrow("Invalid email or password");
    expect(throttle.fail.mock.calls.map(([key]) => key)).toEqual(["acct:nobody@example.com", "ip:203.0.113.7"]);
  });

  it("refuses even the right password while the e-mail or the IP is locked, before looking the user up", async () => {
    users.findByEmail.mockClear();
    throttle.byKeys.mockResolvedValueOnce([{ key: "ip:203.0.113.7", lockedUntil: new Date(Date.now() + 60_000) }]);
    await expect(authService.login("jan@example.com", "the-right-password", office)).rejects.toThrow(TOO_MANY_LOGINS);
    expect(users.findByEmail).not.toHaveBeenCalled();
  });

  it("starts the e-mail's count again after a successful sign-in", async () => {
    throttle.clearFailures.mockClear();
    users.findByEmail.mockResolvedValue({ id: "u-login", companyId: "c1", email: "jan@example.com", passwordHash: await hash("the-right-password"), displayName: "Jan", role: "user", isSystem: false, tokenVersion: 3 });
    const { token } = await authService.login("jan@example.com", "the-right-password", office);
    expect(throttle.clearFailures).toHaveBeenCalledWith("acct:jan@example.com");
    expect((await authService.verifyToken(token)).tokenVersion).toBe(3);
  });
});

describe("tokens after a password change, a deactivation or a role change", () => {
  const tokenOf = async (userId: string, tokenVersion: number) => {
    users.findByEmail.mockResolvedValue({ id: userId, companyId: "c1", email: `${userId}@example.com`, passwordHash: await hash("the-right-password"), displayName: "", role: "admin", isSystem: false, tokenVersion });
    return (await authService.login(`${userId}@example.com`, "the-right-password")).token;
  };

  it("accepts a token whose version the user still has, with the user's current role and company", async () => {
    const token = await tokenOf("u-current", 2);
    users.sessionState.mockResolvedValueOnce({ companyId: "c1", role: "user", tokenVersion: 2, isSystem: false });
    expect(await authService.authenticate(token)).toEqual({ userId: "u-current", companyId: "c1", role: "user" });
  });

  it("refuses a token issued before the password changed", async () => {
    const token = await tokenOf("u-new-password", 0);
    users.sessionState.mockResolvedValueOnce({ companyId: "c1", role: "admin", tokenVersion: 1, isSystem: false });
    await expect(authService.authenticate(token)).rejects.toThrow("Invalid or expired token");
  });

  it("refuses the token of a deactivated user", async () => {
    const token = await tokenOf("u-gone", 0);
    users.sessionState.mockResolvedValueOnce(null);
    await expect(authService.authenticate(token)).rejects.toThrow("Invalid or expired token");
  });
});

describe("password rules", () => {
  it("refuses a password shorter than 12 characters for a new user and for a new password", async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(authService.createUser("c1", { role: "admin" }, { email: "new@example.com", password: "short" })).rejects.toThrow("at least 12 characters");
    users.getByIdInCompany.mockResolvedValue({ id: "u2", email: "u2@example.com", role: "user" });
    await expect(authService.updateUser("u2", "c1", { userID: "u1", role: "admin" }, { password: "short" })).rejects.toThrow("at least 12 characters");
    expect(users.create).not.toHaveBeenCalled();
    expect(users.updateInCompany).not.toHaveBeenCalled();
  });
});

describe("a superadmin's account", () => {
  it("is changed or deactivated by a superadmin only, never by an admin of the same company", async () => {
    users.getByIdInCompany.mockResolvedValue({ id: "sa", email: "sa@example.com", role: "superadmin" });
    await expect(authService.updateUser("sa", "c1", { userID: "u1", role: "admin" }, { password: "a-long-enough-password" })).rejects.toThrow("Only a superadmin");
    await expect(authService.deactivateUser("sa", "c1", { userID: "u1", role: "admin" })).rejects.toThrow("Only a superadmin");
  });
});
