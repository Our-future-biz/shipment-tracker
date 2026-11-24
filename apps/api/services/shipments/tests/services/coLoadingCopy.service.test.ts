import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ get: vi.fn(), shipmentFacts: vi.fn() }));
const services = vi.hoisted(() => ({ requireOpen: vi.fn() }));
const shipments = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/coLoadingSailing.repository", () => ({ coLoadingSailingRepository: repo }));
vi.mock("../../services/coLoadingService.service", () => ({ coLoadingServiceService: services }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: shipments }));

import { APIError } from "encore.dev/api";
import { coLoadingCopyService as service } from "../../services/coLoadingCopy.service";

// "Copy to linked shipments" (Council Outlay 14, A3) against stand-ins: which shipments are written,
// with what, through the shipment's own update - and that one refusal does not stop the others.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SAILING = "22222222-2222-4222-8222-222222222222";
const USER = { userID: "u-user", companyID: COMPANY, role: "user" };
const sailing = { id: SAILING, serviceId: "svc", vessel: "MSC Anna", voyage: "445W", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC", containerCount: 1, cutoffDate: "2026-12-03", departureDate: "2026-12-10" };
const job = (n: number, more = {}) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, jobNumber: `CZLCL0000000${n}`, status: "Booked [IMP]", masterJobId: null, vessel: "", voyage: "", estimatedDeparture: null, closingDate: null, actualDeparture: null, pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", ...more });
const ALL = { vessel: "MSC Anna", voyage: "445W", estimatedDeparture: "2026-12-10", closingDate: "2026-12-03" };

beforeEach(() => {
  vi.clearAllMocks();
  repo.get.mockResolvedValue(sailing);
  services.requireOpen.mockResolvedValue({});
  shipments.update.mockResolvedValue({});
});

describe("a sailing's shipments beside its facts", () => {
  it("lists each linked shipment with what the copy would change", async () => {
    repo.shipmentFacts.mockResolvedValue([job(1), job(2, { ...ALL }), job(3, { masterJobId: "m1" })]);
    const facts = await service.facts(SAILING, COMPANY);
    expect(facts.map((f) => [f.jobNumber, f.changes.length, f.skipped])).toEqual([
      ["CZLCL00000001", 4, null],
      ["CZLCL00000002", 0, null],
      ["CZLCL00000003", 4, "In a master job: its vessel and dates come from there."],
    ]);
  });

  it("is not found for a sailing the company does not have", async () => {
    repo.get.mockResolvedValue(null);
    await expect(service.facts(SAILING, COMPANY)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.facts("not-an-id", COMPANY)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("Copy to linked shipments", () => {
  it("writes only what differs, to the shipments picked, as the one who asks, through the shipment's own update", async () => {
    repo.shipmentFacts.mockResolvedValue([job(1), job(2, { vessel: "MSC Anna", voyage: "445W", closingDate: "2026-12-03" }), job(3)]);
    const result = await service.copy(SAILING, [job(1).id, job(2).id], USER);
    expect(result).toEqual({ copied: 2, refused: [] });
    expect(shipments.update.mock.calls).toEqual([
      [job(1).id, COMPANY, ALL, "u-user", "user"],
      [job(2).id, COMPANY, { estimatedDeparture: "2026-12-10" }, "u-user", "user"],
    ]);
  });

  it("leaves alone a shipment that agrees, is in a master job, is cancelled or has departed", async () => {
    repo.shipmentFacts.mockResolvedValue([job(1, ALL), job(2, { masterJobId: "m1" }), job(3, { status: "Cancelled Shipment" }), job(4, { actualDeparture: "2026-12-10" })]);
    expect(await service.copy(SAILING, [1, 2, 3, 4].map((n) => job(n).id), USER)).toEqual({ copied: 0, refused: [] });
    expect(shipments.update).not.toHaveBeenCalled();
  });

  it("names a shipment whose own rules refuse the write, and still writes the others", async () => {
    repo.shipmentFacts.mockResolvedValue([job(1), job(2)]);
    shipments.update.mockRejectedValueOnce(APIError.permissionDenied("Only the Person in Charge changes this shipment's details."));
    expect(await service.copy(SAILING, [job(1).id, job(2).id], USER)).toEqual({
      copied: 1,
      refused: [{ jobNumber: "CZLCL00000001", reason: "Only the Person in Charge changes this shipment's details." }],
    });
  });

  it("writes nothing with no shipment picked, on a closed service, or to a shipment not on the sailing", async () => {
    await expect(service.copy(SAILING, [], USER)).rejects.toMatchObject({ code: "invalid_argument" });
    repo.shipmentFacts.mockResolvedValue([job(1)]);
    expect(await service.copy(SAILING, [job(9).id], USER)).toEqual({ copied: 0, refused: [] });
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.copy(SAILING, [job(1).id], USER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(shipments.update).not.toHaveBeenCalled();
  });
});
