import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("../repositories/holidayCountryPref.repository", () => ({ holidayCountryPrefRepository: repo }));
vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (m: string) => Object.assign(new Error(m), { code: "invalid_argument" }) } }));

import { cleanCountries, myCountriesService } from "../services/myCountries.service";

beforeEach(() => vi.clearAllMocks());

describe("my countries", () => {
  it("keeps each country once, trimmed and in order, and drops empty ones", async () => {
    expect(cleanCountries([" Germany", "Austria", "Germany ", ""])).toEqual(["Austria", "Germany"]);
    await expect(myCountriesService.set("c1", "u1", ["Slovakia", "Austria"])).resolves.toEqual(["Austria", "Slovakia"]);
    expect(repo.set).toHaveBeenCalledWith("c1", "u1", ["Austria", "Slovakia"]);
  });

  it("an empty list means every country", async () => {
    await myCountriesService.set("c1", "u1", []);
    expect(repo.set).toHaveBeenCalledWith("c1", "u1", []);
  });

  it("refuses a name too long", async () => {
    await expect(myCountriesService.set("c1", "u1", ["x".repeat(101)])).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.set).not.toHaveBeenCalled();
  });
});
