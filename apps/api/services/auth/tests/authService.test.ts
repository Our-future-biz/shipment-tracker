import { describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; the service's repositories and secret are stubbed.
vi.mock("encore.dev/api", () => ({
  APIError: {
    invalidArgument: (msg: string) => new Error(msg),
    notFound: (msg: string) => new Error(msg),
    permissionDenied: (msg: string) => new Error(msg),
  },
}));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("~encore/auth", () => ({ getAuthData: () => null }));
const users = vi.hoisted(() => ({ getByIdInCompany: vi.fn(), softDeleteInCompany: vi.fn() }));
vi.mock("../repositories/user.repository", () => ({ userRepository: users }));
vi.mock("../repositories/company.repository", () => ({ companyRepository: {} }));
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
