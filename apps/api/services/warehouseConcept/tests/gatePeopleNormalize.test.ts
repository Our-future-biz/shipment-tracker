import { beforeEach, describe, expect, it, vi } from "vitest";

// The endpoint itself: the Encore runtime isn't loaded, api() hands back the handler, the
// signed-in user comes from a stubbed getAuthData and the company's users from the faked auth
// client; the backfill service is mocked (gatePeople.test.ts runs it on the database).
const signedIn = vi.hoisted(() => ({ role: "superadmin" }));
vi.mock("encore.dev/api", () => ({
  api: (_opts: unknown, handler: unknown) => handler,
  APIError: {
    permissionDenied: (msg: string) => Object.assign(new Error(msg), { code: "permission_denied" }),
    unauthenticated: (msg: string) => Object.assign(new Error(msg), { code: "unauthenticated" }),
  },
}));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: signedIn.role }) }));
const USERS = vi.hoisted(() => [{ id: "u1", email: " Lukas.Novak@Example.cz", displayName: "Lukáš Novák" }]);
vi.mock("~encore/clients", async () => ({ auth: (await import("./authFake")).authFake(USERS) }));
const normalize = vi.hoisted(() => vi.fn(async () => ({ checked: 0, changed: 0, unmatched: [] })));
vi.mock("../services/gatePeople.service", () => ({ gatePeopleService: { normalize } }));

import { auth } from "~encore/clients";
import { gatePeopleNormalize } from "../controllers/gatePeople.controller";

const run = gatePeopleNormalize as unknown as () => Promise<unknown>;

describe("gate people normalize", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is run by a superadmin, on their own company with its users", async () => {
    signedIn.role = "superadmin";
    await expect(run()).resolves.toEqual({ checked: 0, changed: 0, unmatched: [] });
    expect(normalize).toHaveBeenCalledWith("c1", [{ id: "u1", email: "lukas.novak@example.cz", displayName: "Lukáš Novák" }]);
  });

  it("is refused to everyone else, before anything is loaded", async () => {
    for (const role of ["admin", "manager", "user"]) {
      signedIn.role = role;
      await expect(run()).rejects.toMatchObject({ code: "permission_denied" });
    }
    expect(auth.usersList).not.toHaveBeenCalled();
    expect(normalize).not.toHaveBeenCalled();
  });
});
