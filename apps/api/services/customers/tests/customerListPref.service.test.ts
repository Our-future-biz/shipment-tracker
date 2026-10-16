import { beforeEach, describe, expect, it, vi } from "vitest";

const prefs = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("../repositories/customerListPref.repository", () => ({ customerListPrefRepository: prefs }));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (msg: string) => new Error(msg) } }));

import { customerListPrefService } from "../services/customerListPref.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000002";

beforeEach(() => vi.clearAllMocks());

describe("customer list preferences", () => {
  it("store and return a known key as JSON, per user", async () => {
    await customerListPrefService.set(COMPANY, USER, "columns", '["ico","country"]');
    expect(prefs.set).toHaveBeenCalledWith(COMPANY, USER, "columns", ["ico", "country"]);
    prefs.get.mockResolvedValue({ value: ["ico", "country"] });
    await expect(customerListPrefService.get(COMPANY, USER, "columns")).resolves.toBe('["ico","country"]');
    prefs.get.mockResolvedValue(null);
    await expect(customerListPrefService.get(COMPANY, USER, "filter-templates")).resolves.toBeNull();
  });

  it("refuse an unknown key and a value that is not JSON", async () => {
    await expect(customerListPrefService.get(COMPANY, USER, "shipment-filter-templates")).rejects.toThrow("prefKey must be one of");
    await expect(customerListPrefService.set(COMPANY, USER, "columns", "{oops")).rejects.toThrow("value must be valid JSON");
    await expect(customerListPrefService.set(COMPANY, USER, "columns", "null")).rejects.toThrow("value must not be null");
    expect(prefs.set).not.toHaveBeenCalled();
  });
});
