import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), byName: vi.fn(), setClosed: vi.fn(), setInlandWeight: vi.fn(), setMoney: vi.fn(), create: vi.fn() }));
const settings = vi.hoisted(() => ({ get: vi.fn(), savePlanningPct: vi.fn(), saveChecklist: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../lib/userName", () => ({ userNameOf: async () => "Jana Nová" }));
vi.mock("../../repositories/coLoadingService.repository", () => ({ coLoadingServiceRepository: repo }));
vi.mock("../../repositories/coLoadingSetting.repository", () => ({ coLoadingSettingRepository: settings }));

import { coLoadingServiceService as service } from "../../services/coLoadingService.service";

// Co-Loading Concept's services against a stand-in for the database: a name taken by a closed service
// or an open one, closing and reopening twice, and what a closed service still refuses.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SERVICE = "11111111-1111-4111-8111-111111111111";
const MANAGER = { userID: "u-manager", companyID: COMPANY, role: "manager" };

const row = (more = {}) => ({
  id: SERVICE,
  companyId: COMPANY,
  name: "Import from Shanghai",
  serviceName: "ISHA",
  frequency: "weekly",
  direction: "import",
  mode: "sea_lcl",
  origin: "",
  destination: "",
  note: "",
  inlandWeightKg: null as number | null,
  createdById: "u-manager",
  createdByName: "Jana Nová",
  createdAt: new Date("2026-11-20T08:00:00Z"),
  updatedAt: new Date("2026-11-20T08:00:00Z"),
  deletedAt: null,
  closedAt: null as Date | null,
  closedById: null as string | null,
  closedByName: "",
  ...more,
});
const input = { name: "Import from Shanghai", serviceName: "ISHA", frequency: "weekly", direction: "import", mode: "sea_lcl" };

beforeEach(() => {
  vi.clearAllMocks();
  repo.get.mockResolvedValue(row());
});

describe("a new service", () => {
  it("is refused with a name the company has: reopen a closed one, or pick another", async () => {
    repo.create.mockResolvedValue(null);
    repo.byName.mockResolvedValue(row({ name: "IMPORT FROM SHANGHAI", closedAt: new Date() }));
    await expect(service.create(input, MANAGER)).rejects.toMatchObject({ code: "already_exists", message: 'There is a closed service called "IMPORT FROM SHANGHAI" already. Reopen it instead.' });
    repo.byName.mockResolvedValue(row());
    await expect(service.create(input, MANAGER)).rejects.toMatchObject({ code: "already_exists", message: 'There is a service called "Import from Shanghai" already.' });
    expect(repo.byName).toHaveBeenCalledWith("Import from Shanghai", COMPANY);
  });

  it("is made in the caller's company, by them", async () => {
    repo.create.mockImplementation(async (values: object) => row(values));
    await service.create({ ...input, name: "  Import  from Shanghai " }, MANAGER);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY, name: "Import from Shanghai", createdById: "u-manager", createdByName: "Jana Nová" }));
  });
});

describe("closing and reopening a service", () => {
  it("keeps who closed it first when it is closed again", async () => {
    const closedAt = new Date("2026-11-21T10:00:00Z");
    repo.get.mockResolvedValue(row({ closedAt, closedById: "u-first", closedByName: "Eva Malá" }));
    expect(await service.close(SERVICE, MANAGER)).toMatchObject({ closedAt: closedAt.toISOString(), closedByName: "Eva Malá" });
    expect(repo.setClosed).not.toHaveBeenCalled();
  });

  it("closes an open one as the manager who does it", async () => {
    repo.setClosed.mockResolvedValue(row({ closedAt: new Date(), closedByName: "Jana Nová" }));
    await service.close(SERVICE, MANAGER);
    expect(repo.setClosed).toHaveBeenCalledWith(SERVICE, COMPANY, { id: "u-manager", name: "Jana Nová" });
  });

  it("reopens a closed one, and leaves an open one as it is", async () => {
    expect(await service.reopen(SERVICE, COMPANY)).toMatchObject({ closedAt: null });
    expect(repo.setClosed).not.toHaveBeenCalled();
    repo.get.mockResolvedValue(row({ closedAt: new Date() }));
    repo.setClosed.mockResolvedValue(row());
    await service.reopen(SERVICE, COMPANY);
    expect(repo.setClosed).toHaveBeenCalledWith(SERVICE, COMPANY, null);
  });

  it("does not find a service of another company", async () => {
    repo.get.mockResolvedValue(null);
    await expect(service.close(SERVICE, MANAGER)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.get("not-an-id", COMPANY)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("a service's inland weight", () => {
  it("is refused while the service is closed: nothing is written", async () => {
    repo.get.mockResolvedValue(row({ closedAt: new Date() }));
    await expect(service.setInlandWeight(SERVICE, 20000, COMPANY)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.setInlandWeight).not.toHaveBeenCalled();
  });

  it("is refused outside 1,000 to 50,000 kg, and taken off with null", async () => {
    await expect(service.setInlandWeight(SERVICE, 500, COMPANY)).rejects.toMatchObject({ code: "invalid_argument" });
    repo.setInlandWeight.mockResolvedValue(row());
    await service.setInlandWeight(SERVICE, null, COMPANY);
    expect(repo.setInlandWeight).toHaveBeenCalledWith(SERVICE, COMPANY, null);
  });
});

describe("the company's planning share", () => {
  it("is 85% until a manager changes it, and saved for the caller's company only", async () => {
    settings.get.mockResolvedValue(null);
    expect(await service.settings(COMPANY, "user")).toMatchObject({ planningVolumePct: 85, changed: false, canEdit: false });
    await expect(service.saveSettings(49, MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
    settings.get.mockResolvedValue({ companyId: COMPANY, planningVolumePct: 80 });
    expect(await service.saveSettings(80, MANAGER)).toMatchObject({ planningVolumePct: 80, changed: true, canEdit: true });
    expect(settings.savePlanningPct).toHaveBeenCalledWith(COMPANY, 80, "u-manager");
  });

  it("keeps the company's own checklist per direction, tidied, and the six steps where none is set (C5)", async () => {
    settings.get.mockResolvedValue(null);
    expect((await service.settings(COMPANY, "user")).checklistImport).toHaveLength(6);
    await expect(service.saveChecklist("sideways", ["A"], MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.saveChecklist("import", ["A", "a"], MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
    settings.get.mockResolvedValue({ companyId: COMPANY, planningVolumePct: 85, checklistImport: ["Booking confirmed", "Devanned"], checklistExport: null });
    const saved = await service.saveChecklist("import", [" Booking confirmed ", "Devanned", ""], MANAGER);
    expect(settings.saveChecklist).toHaveBeenCalledWith(COMPANY, "import", ["Booking confirmed", "Devanned"], "u-manager", 85);
    // A row made for the checklist alone still plans with the starting figure.
    expect(saved).toMatchObject({ changed: false, checklistImport: ["Booking confirmed", "Devanned"] });
    expect(saved.checklistExport).toHaveLength(6);
  });
});

describe("a service's money settings (Council Outlay 14, B4)", () => {
  const defaults = [{ kind: "ocean", amount: 2100, currency: "usd", note: " tariff " }];

  it("reads them from the service of the caller's company, and none where it has none", async () => {
    repo.get.mockResolvedValue(row({ defaultBoxCosts: null, minEarningPerWm: "85.50" }));
    expect(await service.money(SERVICE, COMPANY)).toEqual({ defaultBoxCosts: null, minEarningPerWm: 85.5 });
    expect(repo.get).toHaveBeenCalledWith(SERVICE, COMPANY);
  });

  it("saves them tidied, as the three costs of one container", async () => {
    repo.setMoney.mockImplementation(async (_id: string, _company: string, money: { defaultBoxCosts: unknown; minEarningPerWm: number | null }) => row({ defaultBoxCosts: money.defaultBoxCosts, minEarningPerWm: String(money.minEarningPerWm) }));
    const saved = await service.saveMoney(SERVICE, { defaultBoxCosts: defaults, minEarningPerWm: 80 }, COMPANY);
    expect(repo.setMoney).toHaveBeenCalledWith(SERVICE, COMPANY, {
      defaultBoxCosts: [
        { kind: "origin", amount: null, currency: "EUR", note: "" },
        { kind: "ocean", amount: 2100, currency: "USD", note: "tariff" },
        { kind: "destination", amount: null, currency: "EUR", note: "" },
      ],
      minEarningPerWm: 80,
    });
    expect(saved.minEarningPerWm).toBe(80);
  });

  it("refuses a cost or a minimum that is none: nothing is written", async () => {
    await expect(service.saveMoney(SERVICE, { defaultBoxCosts: [{ kind: "ocean", amount: -5, currency: "EUR", note: "" }], minEarningPerWm: null }, COMPANY)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.saveMoney(SERVICE, { defaultBoxCosts: null, minEarningPerWm: 0 }, COMPANY)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.setMoney).not.toHaveBeenCalled();
  });

  it("does not find the service of another company, nor one gone by the time it is written", async () => {
    repo.get.mockResolvedValue(null);
    await expect(service.money(SERVICE, COMPANY)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.saveMoney(SERVICE, { defaultBoxCosts: null, minEarningPerWm: 50 }, COMPANY)).rejects.toMatchObject({ code: "not_found" });
    expect(repo.setMoney).not.toHaveBeenCalled();
    repo.get.mockResolvedValue(row());
    repo.setMoney.mockResolvedValue(null);
    await expect(service.saveMoney(SERVICE, { defaultBoxCosts: null, minEarningPerWm: 50 }, COMPANY)).rejects.toMatchObject({ code: "not_found" });
  });
});
