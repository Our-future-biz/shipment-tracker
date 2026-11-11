import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("./encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const userLookup = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { userLookup } }));

import { USER_LOOKUP_UNAVAILABLE, userEmailOf } from "../companyUsers";

const ROOT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("userEmailOf: who did something, by e-mail", () => {
  it("asks for the signed-in user themself in their own company too (a superadmin working as another one)", async () => {
    userLookup.mockResolvedValue({ users: [{ id: ROOT, name: "Root", email: " Root@Platform.cz ", role: "superadmin" }] });
    await expect(userEmailOf(ROOT)).resolves.toBe("root@platform.cz");
    expect(userLookup).toHaveBeenCalledWith({ ids: [ROOT], selfInOwnCompany: true });
  });

  // Changed: a failed look-up used to answer "" as well, and the callers saved "" as who approved or
  // created something. Now only "no such user" is "".
  it("is empty for nobody and for a user not found", async () => {
    await expect(userEmailOf("")).resolves.toBe("");
    expect(userLookup).not.toHaveBeenCalled();
    userLookup.mockResolvedValue({ users: [] });
    await expect(userEmailOf(ROOT)).resolves.toBe("");
  });

  it("refuses as unavailable when the look-up fails, so nobody is never recorded as who did it", async () => {
    userLookup.mockRejectedValue(new Error("auth down"));
    await expect(userEmailOf(ROOT)).rejects.toMatchObject({ code: "unavailable", message: USER_LOOKUP_UNAVAILABLE });
  });
});
