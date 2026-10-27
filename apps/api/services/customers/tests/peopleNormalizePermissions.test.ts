import { beforeEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest: api() hands back the handler, and the signed-in
// user comes from a stubbed getAuthData.
const auth = vi.hoisted(() => ({ role: "superadmin" }));
vi.mock("encore.dev/api", () => ({
  api: (_opts: unknown, handler: unknown) => handler,
  APIError: {
    permissionDenied: (msg: string) => Object.assign(new Error(msg), { code: "permission_denied" }),
    unauthenticated: (msg: string) => new Error(msg),
  },
}));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: auth.role }) }));
const normalize = vi.hoisted(() => vi.fn(async () => ({ checked: 0, changed: 0, unmatched: [] })));
vi.mock("../services/peopleNormalize.service", () => ({ customerPeopleService: { normalize } }));

import { customerPeopleNormalize } from "../controllers/customerPeopleNormalize.controller";

const run = customerPeopleNormalize as unknown as () => Promise<unknown>;

describe("customer people normalize", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is run by a superadmin, on their own company", async () => {
    auth.role = "superadmin";
    await expect(run()).resolves.toEqual({ checked: 0, changed: 0, unmatched: [] });
    expect(normalize).toHaveBeenCalledWith("c1");
  });

  it("is refused to everyone else", async () => {
    for (const role of ["admin", "manager", "user"]) {
      auth.role = role;
      await expect(run()).rejects.toMatchObject({ code: "permission_denied" });
    }
    expect(normalize).not.toHaveBeenCalled();
  });
});
