import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const repo = vi.hoisted(() => ({ getById: vi.fn(), update: vi.fn(), getAll: vi.fn() }));
vi.mock("../repositories/company.repository", () => ({ companyRepository: repo }));

import { cleanHiddenModules, companyService } from "../services/company.service";

const ID = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const row = (hiddenModules: string[]) => ({ id: ID, name: "Austromar", slug: "austromar", createdAt: new Date("2026-01-01T00:00:00Z"), hiddenModules });

describe("company modules", () => {
  it("keeps each known module once, in a fixed order, and refuses an unknown one", () => {
    expect(cleanHiddenModules(["trucking_concept", "warehouse_concept", "trucking_concept"])).toEqual(["warehouse_concept", "trucking_concept"]);
    expect(cleanHiddenModules([])).toEqual([]);
    expect(() => cleanHiddenModules(["invoicing"])).toThrow(/Unknown module: invoicing/);
    expect(() => cleanHiddenModules("trucking_concept")).toThrow(/must be a list/);
  });

  it("lists companies with their hidden modules and sets them", async () => {
    repo.getAll.mockResolvedValue([row(["trucking_concept"])]);
    expect(await companyService.list()).toEqual([
      { id: ID, name: "Austromar", slug: "austromar", createdAt: "2026-01-01T00:00:00.000Z", hiddenModules: ["trucking_concept"] },
    ]);
    repo.update.mockImplementation(async (_id: string, v: { hiddenModules: string[] }) => row(v.hiddenModules));
    await expect(companyService.setHiddenModules(ID, ["warehouse_concept"])).resolves.toMatchObject({ hiddenModules: ["warehouse_concept"] });
    expect(repo.update).toHaveBeenCalledWith(ID, { hiddenModules: ["warehouse_concept"] });
    repo.update.mockResolvedValueOnce(null);
    await expect(companyService.setHiddenModules(ID, [])).rejects.toMatchObject({ code: "not_found" });
    await expect(companyService.setHiddenModules("nope", [])).rejects.toMatchObject({ code: "not_found" });
  });

  it("reads none for an unknown company", async () => {
    repo.getById.mockResolvedValue(null);
    expect(await companyService.hiddenModulesOf(ID)).toEqual([]);
    expect(await companyService.hiddenModulesOf("not-a-uuid")).toEqual([]);
  });
});
