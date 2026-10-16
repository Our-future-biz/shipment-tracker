import { describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; the service's repositories and secret are stubbed.
vi.mock("encore.dev/api", () => ({
  APIError: {
    invalidArgument: (msg: string) => new Error(msg),
    notFound: (msg: string) => new Error(msg),
    permissionDenied: (msg: string) => new Error(msg),
    unauthenticated: (msg: string) => new Error(msg),
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
}));
vi.mock("../repositories/user.repository", () => ({ userRepository: users }));
const companies = vi.hoisted(() => ({ getById: vi.fn(async () => null) }));
vi.mock("../repositories/company.repository", () => ({ companyRepository: companies }));
vi.mock("../repositories/orgUnit.repository", () => ({ departmentRepository: {}, branchRepository: {} }));

import { assertNotSelf, authService } from "../services/auth.service";

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
    vi.spyOn(authService, "verifyToken").mockResolvedValueOnce({ userId: "svc-1", companyId: "c1", role: "user" });
    users.getById.mockResolvedValue(system);
    await expect(authService.me("token")).rejects.toThrow("User not found");
  });

  it("is created on demand for the caller's company", async () => {
    expect(await authService.serviceUser("c1")).toBe("svc-1");
    expect(users.ensureSystemUser).toHaveBeenCalledWith("c1");
  });
});
