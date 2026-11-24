import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), byName: vi.fn(), setClosed: vi.fn(), setInlandWeight: vi.fn(), create: vi.fn() }));
const settings = vi.hoisted(() => ({ get: vi.fn(), savePlanningPct: vi.fn() }));
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
    expect(await service.settings(COMPANY, "user")).toEqual({ planningVolumePct: 85, changed: false, canEdit: false });
    await expect(service.saveSettings(49, MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
    settings.get.mockResolvedValue({ companyId: COMPANY, planningVolumePct: 80 });
    expect(await service.saveSettings(80, MANAGER)).toEqual({ planningVolumePct: 80, changed: true, canEdit: true });
    expect(settings.savePlanningPct).toHaveBeenCalledWith(COMPANY, 80, "u-manager");
  });
});
