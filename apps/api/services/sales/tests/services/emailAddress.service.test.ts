import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against a stand-in for the repository.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/salesPreference.repository", () => ({
  salesPreferenceRepository: { get: vi.fn(), set: vi.fn() },
}));

import type { Actor } from "../../../../lib/rbac";
import { salesPreferenceRepository } from "../../repositories/salesPreference.repository";
import { emailAddressService, MAX_ADDRESSES, withUsed } from "../../services/emailAddress.service";
import { preferenceService } from "../../services/preference.service";

const repository = vi.mocked(salesPreferenceRepository);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const lukas: Actor = { userID: "user-1", companyID: COMPANY, role: "user" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("withUsed", () => {
  it("puts the addresses just used first, moving up those already there, each once whatever its case", () => {
    expect(withUsed(["a@x.cz", "b@x.cz", "c@x.cz"], ["C@x.cz", "d@x.cz", "d@x.cz"])).toEqual(["C@x.cz", "d@x.cz", "a@x.cz", "b@x.cz"]);
  });

  it("leaves out what is no address, and keeps at most the limit", () => {
    expect(withUsed([], ["not an address", " e@x.cz ", "f@x", ""])).toEqual(["e@x.cz"]);
    const many = Array.from({ length: MAX_ADDRESSES }, (_, i) => `u${i}@x.cz`);
    const kept = withUsed(many, ["new@x.cz"]);
    expect(kept).toHaveLength(MAX_ADDRESSES);
    expect(kept[0]).toBe("new@x.cz");
    expect(kept).not.toContain(`u${MAX_ADDRESSES - 1}@x.cz`);
  });
});

describe("emailAddressService", () => {
  it("reads and writes the user's own list, under a key of theirs", async () => {
    repository.get.mockResolvedValue(["a@x.cz", 7, "a@x.cz"]);
    await expect(emailAddressService.list(lukas)).resolves.toEqual(["a@x.cz"]);
    expect(repository.get).toHaveBeenCalledWith("email_addresses:user-1", COMPANY);
    await expect(emailAddressService.used(lukas, ["b@x.cz"])).resolves.toEqual(["b@x.cz", "a@x.cz"]);
    expect(repository.set).toHaveBeenCalledWith("email_addresses:user-1", COMPANY, ["b@x.cz", "a@x.cz"]);
  });

  it("forgets an address, whatever its case", async () => {
    repository.get.mockResolvedValue(["a@x.cz", "b@x.cz"]);
    await expect(emailAddressService.forget(lukas, "A@X.cz")).resolves.toEqual(["b@x.cz"]);
  });

  it("refuses too many at a time", async () => {
    await expect(emailAddressService.used(lukas, Array.from({ length: 51 }, (_, i) => `u${i}@x.cz`))).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("is not given to anybody through the shared preferences", async () => {
    await expect(preferenceService.get("email_addresses:user-1", COMPANY)).rejects.toMatchObject({ code: "permission_denied" });
  });
});
