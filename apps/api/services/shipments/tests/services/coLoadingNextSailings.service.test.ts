import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A service's next sailings for a Sea LCL quote (Council Outlay 14, C7), against stand-ins for the
// database and the services: which service is asked for, how many sailings come, and what each holds.
const repo = vi.hoisted(() => ({ comingOfServices: vi.fn(), boxShipmentsOf: vi.fn() }));
const services = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), planningVolumePct: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ fx: {}, invoicing: {} }));
vi.mock("../../lib/userName", () => ({ userNameOf: vi.fn() }));
vi.mock("../../../../lib/companyUsers", () => ({ companyUsers: vi.fn() }));
vi.mock("../../repositories/shipmentComment.repository", () => ({ shipmentCommentRepository: {} }));
vi.mock("../../repositories/coLoadingBoxCost.repository", () => ({ coLoadingBoxCostRepository: {}, BoxCostsChangedMeanwhile: class extends Error {} }));
vi.mock("../../repositories/coLoadingSailing.repository", () => ({ coLoadingSailingRepository: repo }));
vi.mock("../../services/coLoadingService.service", () => ({ coLoadingServiceService: services }));

import { coLoadingSailingService as service } from "../../services/coLoadingSailing.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SERVICE = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const open = { id: SERVICE, name: "Import from Shanghai", mode: "sea_lcl", inlandWeightKg: null, closedAt: null };
const sailing = (n: number) => ({
  id: `sailing-${n}`,
  serviceId: SERVICE,
  vessel: "WEEK 5" + n,
  voyage: "",
  pol: "Shanghai",
  pod: "Hamburg",
  hub: "Praha",
  containerType: "40' HC",
  containerCount: 1,
  cutoffDate: `2026-12-0${n}`,
  departureDate: `2026-12-1${n}`,
  stage: "open",
  createdByName: "Jana",
  createdAt: new Date("2026-11-01T08:00:00.000Z"),
  currency: "EUR",
  note: "",
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T10:00:00.000Z"));
  services.list.mockResolvedValue([open]);
  services.planningVolumePct.mockResolvedValue(85);
  repo.comingOfServices.mockResolvedValue([1, 2, 3, 4].map(sailing));
  repo.boxShipmentsOf.mockResolvedValue(new Map());
});
afterEach(() => vi.useRealTimers());

describe("nextOfService", () => {
  it("gives the open service's first sailings still to come, of the company, as the board shows them", async () => {
    const answer = await service.nextOfService(SERVICE, COMPANY, 3);
    expect(services.list).toHaveBeenCalledWith(COMPANY, "user");
    expect(repo.comingOfServices).toHaveBeenCalledWith([SERVICE], COMPANY, "2026-11-25");
    // The fill is read for the three given only.
    expect(repo.boxShipmentsOf).toHaveBeenCalledWith(["sailing-1", "sailing-2", "sailing-3"], COMPANY);
    expect(answer.open).toBe(true);
    expect(answer.name).toBe("Import from Shanghai");
    expect(answer.sailings.map((s) => s.id)).toEqual(["sailing-1", "sailing-2", "sailing-3"]);
    expect(answer.sailings[0]).toMatchObject({ serviceId: SERVICE, serviceLabel: "Import from Shanghai", cutoffDate: "2026-12-01", departureDate: "2026-12-11", cancelled: 0, dangerous: 0 });
    expect(answer.sailings[0]).toHaveProperty("fill");
    expect(answer.sailings[0]).toHaveProperty("free");
  });

  it("gives none, and says the service is not open, for a closed service or one the company does not have", async () => {
    services.list.mockResolvedValue([{ ...open, id: OTHER }]);
    await expect(service.nextOfService(SERVICE, COMPANY, 3)).resolves.toEqual({ open: false, name: "", sailings: [] });
    expect(repo.comingOfServices).not.toHaveBeenCalled();
  });

  it("fails, and does not say there are none, when the sailings cannot be read", async () => {
    repo.comingOfServices.mockRejectedValue(new Error("connection refused"));
    await expect(service.nextOfService(SERVICE, COMPANY, 3)).rejects.toThrow("connection refused");
  });
});
