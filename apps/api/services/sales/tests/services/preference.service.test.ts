import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real, with the policy it asks, against a stand-in for the repository.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/salesPreference.repository", () => ({
  salesPreferenceRepository: { get: vi.fn(), set: vi.fn() },
}));

import type { Actor } from "../../../../lib/rbac";
import { salesPreferenceRepository } from "../../repositories/salesPreference.repository";
import { preferenceService } from "../../services/preference.service";

const repository = vi.mocked(salesPreferenceRepository);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const actor = (role: string): Actor => ({ userID: "user-1", companyID: COMPANY, role });
const user = actor("user");
const DETAILS = { name: "Forwarder s.r.o.", vat: "CZ12345678" };
const COLUMNS = ["reference", "customer", "route", "status"];
const VIEWS = [{ id: "a091b98e-c845-4107-b175-dd4272141d7a", label: "Hot leads", search: "", filters: { statuses: ["quoted"] } }];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("get", () => {
  it("is open to everybody, the company details included: quotations print them", async () => {
    repository.get.mockResolvedValue(DETAILS);
    await expect(preferenceService.get("company_details", COMPANY)).resolves.toEqual(DETAILS);
    expect(repository.get).toHaveBeenCalledWith("company_details", COMPANY);
  });
});

describe("set", () => {
  it("stores the company details for who may edit the Sales settings, under the caller's company", async () => {
    for (const role of ["superadmin", "admin", "manager"]) {
      repository.set.mockClear();
      await preferenceService.set("company_details", actor(role), DETAILS);
      expect(repository.set, role).toHaveBeenCalledWith("company_details", COMPANY, DETAILS);
    }
  });

  it("refuses a plain user the company details and writes nothing", async () => {
    await expect(preferenceService.set("company_details", user, DETAILS)).rejects.toMatchObject({
      code: "permission_denied",
      message: "only managers and admins can change this",
    });
    expect(repository.set).not.toHaveBeenCalled();
  });

  it("stores the columns and the saved views of the Quotes list for anybody, as before", async () => {
    await preferenceService.set("qh_cols", user, COLUMNS);
    expect(repository.set).toHaveBeenLastCalledWith("qh_cols", COMPANY, COLUMNS);
    await preferenceService.set("saved_views", user, VIEWS);
    expect(repository.set).toHaveBeenLastCalledWith("saved_views", COMPANY, VIEWS);
    expect(repository.set).toHaveBeenCalledTimes(2);
  });

  it("looks at the form of a value only: column names of an older list and an empty list are stored", async () => {
    // Origin and Destination were columns before they became Route.
    await preferenceService.set("qh_cols", user, ["reference", "origin", "destination", "no such column"]);
    await preferenceService.set("qh_cols", user, []);
    await preferenceService.set("saved_views", user, []);
    await preferenceService.set("company_details", actor("manager"), {});
    expect(repository.set).toHaveBeenCalledTimes(4);
  });

  it("refuses a key nothing stores under, for everybody, and writes nothing", async () => {
    for (const prefKey of ["qh_columns", "anything", "", "constructor", "__proto__"]) {
      await expect(preferenceService.set(prefKey, actor("admin"), ["a"]), prefKey).rejects.toMatchObject({
        code: "invalid_argument",
        message: `there is no preference "${prefKey}" to store`,
      });
    }
    expect(repository.set).not.toHaveBeenCalled();
  });

  it("refuses a missing value instead of storing an empty one", async () => {
    for (const prefKey of ["qh_cols", "saved_views", "company_details"]) {
      for (const value of [undefined, null]) {
        await expect(preferenceService.set(prefKey, actor("admin"), value), `${prefKey} ${value}`).rejects.toMatchObject({
          code: "invalid_argument",
          message: "value is required",
        });
      }
    }
    expect(repository.set).not.toHaveBeenCalled();
  });

  it("refuses a value that does not have the form of its preference", async () => {
    const wrong: Record<string, unknown[]> = {
      qh_cols: [{}, "reference", 5, ["reference", 5], [["reference"]], [null]],
      saved_views: [{}, "views", ["My view"], [null], [{ id: "1" }], [{ label: "My view" }], [{ id: 1, label: "My view" }], [VIEWS[0], { id: "2", label: 2 }]],
      company_details: [[], [DETAILS], "Forwarder s.r.o.", 5, true],
    };
    for (const [prefKey, values] of Object.entries(wrong)) {
      for (const value of values) {
        await expect(preferenceService.set(prefKey, actor("admin"), value), `${prefKey} ${JSON.stringify(value)}`).rejects.toMatchObject({
          code: "invalid_argument",
          message: `the value of "${prefKey}" does not have the form this preference is stored in`,
        });
      }
    }
    expect(repository.set).not.toHaveBeenCalled();
  });

  it("refuses a value of more than 64 KB of JSON, and stores one just under it", async () => {
    // Each key is 12 bytes of JSON with its quotes and comma; the brackets add one more.
    const keys = (count: number) => Array.from({ length: count }, (_, i) => `c${String(i).padStart(8, "0")}`);
    const fits = keys(5461);
    expect(Buffer.byteLength(JSON.stringify(fits))).toBe(65533);
    await preferenceService.set("qh_cols", user, fits);
    expect(repository.set).toHaveBeenCalledTimes(1);

    const tooLarge = keys(5462);
    expect(Buffer.byteLength(JSON.stringify(tooLarge))).toBe(65545);
    await expect(preferenceService.set("qh_cols", user, tooLarge)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "the value is too large - at most 64 KB",
    });
    // Counted in bytes, not in letters: these 33 000 letters are 66 000 bytes.
    await expect(preferenceService.set("company_details", actor("manager"), { name: "ř".repeat(33000) })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "the value is too large - at most 64 KB",
    });
    expect(repository.set).toHaveBeenCalledTimes(1);
  });

  it("refuses a plain user the company details before anything is said about the value", async () => {
    for (const value of [undefined, [], "x".repeat(70000)]) {
      await expect(preferenceService.set("company_details", user, value)).rejects.toMatchObject({ code: "permission_denied" });
    }
    expect(repository.set).not.toHaveBeenCalled();
  });

  it("refuses the old list of follow-up tasks for everybody and writes nothing: the tasks are rows now", async () => {
    for (const role of ["superadmin", "admin", "manager", "user"]) {
      await expect(preferenceService.set("followup_tasks", actor(role), [{ id: "1", company: "ACME" }]), role).rejects.toMatchObject({
        code: "failed_precondition",
        message: "follow-up tasks have moved - reload the page",
      });
    }
    expect(repository.set).not.toHaveBeenCalled();
  });

  it("still hands out the old list: it stays readable as an archive", async () => {
    repository.get.mockResolvedValue([{ id: "1", company: "ACME" }]);
    await expect(preferenceService.get("followup_tasks", COMPANY)).resolves.toEqual([{ id: "1", company: "ACME" }]);
  });
});
