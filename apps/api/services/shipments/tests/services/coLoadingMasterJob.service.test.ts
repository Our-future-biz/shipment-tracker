import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ get: vi.fn(), boxShipments: vi.fn(), setMasterJobJudged: vi.fn(), sailingOfMasterJob: vi.fn(), clearMasterJob: vi.fn() }));
const masterJobs = vi.hoisted(() => ({ getByIdForCompany: vi.fn(), findByMczNumber: vi.fn(), mczNumbersByIds: vi.fn() }));
const masterJobService = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), update: vi.fn(), linkShipments: vi.fn() }));
const services = vi.hoisted(() => ({ requireOpen: vi.fn() }));
const shipments = vi.hoisted(() => ({ requireDetailsEditor: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../lib/userName", () => ({ userNameOf: async () => "Jana Nová" }));
vi.mock("../../repositories/coLoadingSailing.repository", () => ({ coLoadingSailingRepository: repo }));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: masterJobs }));
vi.mock("../../services/masterJob.service", () => ({ masterJobService }));
vi.mock("../../services/coLoadingService.service", () => ({ coLoadingServiceService: services }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: shipments }));

import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { coLoadingMasterJobService as service } from "../../services/coLoadingMasterJob.service";

// A sailing's Master Job (Council Outlay 14, C2) against stand-ins for the database and the Master
// Job's own code: what is refused before anything is made or written, the one Master Job per
// sailing - judged under the sailing's lock - and the one sailing per Master Job.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SAILING = "22222222-2222-4222-8222-222222222222";
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const USER = { userID: "u-user", companyID: COMPANY, role: "user" };
const sailing = (more = {}) => ({ id: SAILING, serviceId: "svc", vessel: "MSC Anna", voyage: "445W", departureDate: "2026-12-05", cutoffDate: "2026-12-01", masterJobId: null as string | null, ...more });
const cargo = (id: string, jobNumber: string, masterJobId: string | null = null) => ({ id, jobNumber, customer: "Alfa", status: "Booked [IMP]", masterJobId });
const made = { id: "mj-new", mczNumber: "MCZLCL00000012", vessel: "", voyage: "", estimatedDeparture: null, closingDate: null };
const detail = { masterJob: { id: "mj-new", mczNumber: "MCZLCL00000012", masterBolNumber: "", vessel: "MSC Anna", voyage: "445W" }, containers: [], shipments: [] };

// The repository holds the sailing's lock, hands the judge the sailing as it is then, and sets what `masterJob` gives.
const underLock = (now = sailing()) =>
  repo.setMasterJobJudged.mockImplementation(async (_id: string, _company: string, _by: unknown, judge: (row: unknown) => Promise<void>, masterJob: () => Promise<unknown>) => {
    await judge(now);
    return masterJob();
  });

beforeEach(() => {
  vi.clearAllMocks();
  repo.get.mockResolvedValue(sailing());
  repo.boxShipments.mockResolvedValue([cargo(A, "CZLCL1"), cargo(B, "CZLCL2")]);
  repo.sailingOfMasterJob.mockResolvedValue(null);
  services.requireOpen.mockResolvedValue({ id: "svc" });
  shipments.requireDetailsEditor.mockResolvedValue(undefined);
  masterJobs.getByIdForCompany.mockResolvedValue(null);
  masterJobService.create.mockResolvedValue(made);
  masterJobService.get.mockResolvedValue(detail);
  underLock();
});

describe("\"Create master job\" from a sailing", () => {
  it("makes it under the sailing's lock with the ticked shipments, gives it the sailing's facts and links them by its own rules", async () => {
    await service.create(SAILING, [A, B, A], USER);
    expect(repo.setMasterJobJudged).toHaveBeenCalledWith(SAILING, COMPANY, { id: "u-user", name: "Jana Nová" }, expect.any(Function), expect.any(Function));
    expect(masterJobService.create).toHaveBeenCalledWith(COMPANY, "u-user", [A, B]);
    expect(masterJobService.update).toHaveBeenCalledWith("mj-new", COMPANY, { vessel: "MSC Anna", voyage: "445W", estimatedDeparture: "2026-12-05", closingDate: "2026-12-01" }, "u-user");
    expect(masterJobService.linkShipments).toHaveBeenCalledWith("mj-new", COMPANY, [A, B], "u-user");
  });

  it("is refused while the sailing's Master Job is still there; one deleted since leaves it with none", async () => {
    repo.get.mockResolvedValue(sailing({ masterJobId: "mj-1" }));
    masterJobs.getByIdForCompany.mockResolvedValue({ id: "mj-1" });
    await expect(service.create(SAILING, [A], USER)).rejects.toMatchObject({ code: "failed_precondition", message: "This sailing has a Master Job already: unlink it first." });
    expect(masterJobService.create).not.toHaveBeenCalled();
    masterJobs.getByIdForCompany.mockResolvedValue(null);
    await service.create(SAILING, [A], USER);
    expect(masterJobService.create).toHaveBeenCalledTimes(1);
  });

  it("makes none when another create gave the sailing one while this one waited for its lock: no Master Job is left orphaned", async () => {
    underLock(sailing({ masterJobId: "mj-first" }));
    masterJobs.getByIdForCompany.mockImplementation(async (id: string) => (id === "mj-first" ? { id } : null));
    await expect(service.create(SAILING, [A], USER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(masterJobService.create).not.toHaveBeenCalled();
    expect(masterJobService.linkShipments).not.toHaveBeenCalled();
  });

  it("checks who may change each shipment's details before anything is made: one refusal makes nothing", async () => {
    shipments.requireDetailsEditor.mockImplementation(async (id: string) => {
      if (id === B) throw APIError.permissionDenied("Only its Person in Charge changes CZLCL2's details.");
    });
    await expect(service.create(SAILING, [A, B], USER)).rejects.toMatchObject({ code: "permission_denied" });
    expect(shipments.requireDetailsEditor).toHaveBeenCalledWith(A, USER);
    expect(repo.setMasterJobJudged).not.toHaveBeenCalled();
    expect(masterJobService.create).not.toHaveBeenCalled();
  });

  it("refuses a shipment in another Master Job, and one no longer on the sailing", async () => {
    repo.boxShipments.mockResolvedValue([cargo(A, "CZLCL1", "mj-other")]);
    await expect(service.create(SAILING, [A], USER)).rejects.toMatchObject({ code: "failed_precondition", message: "CZLCL1 is in another Master Job: take it off that one first." });
    await expect(service.create(SAILING, [B], USER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(masterJobService.create).not.toHaveBeenCalled();
  });

  it("is refused on a closed service: nothing is made", async () => {
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.create(SAILING, [A], USER)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(service.link(SAILING, "MCZLCL00000012", USER)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(service.unlink(SAILING, USER)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(service.putOn(SAILING, [A], USER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(masterJobService.create).not.toHaveBeenCalled();
    expect(repo.setMasterJobJudged).not.toHaveBeenCalled();
    expect(repo.clearMasterJob).not.toHaveBeenCalled();
    expect(masterJobService.linkShipments).not.toHaveBeenCalled();
  });
});

describe("linking an existing Master Job to a sailing", () => {
  const found = { id: "mj-7", mczNumber: "MCZLCL00000007" };
  beforeEach(() => masterJobs.findByMczNumber.mockResolvedValue(found));

  it("links it by its number, read in capitals", async () => {
    await service.link(SAILING, " mczlcl00000007 ", USER);
    expect(masterJobs.findByMczNumber).toHaveBeenCalledWith("MCZLCL00000007", COMPANY);
    expect(repo.setMasterJobJudged).toHaveBeenCalledTimes(1);
    expect(masterJobService.create).not.toHaveBeenCalled();
  });

  it("refuses one that is the Master Job of another sailing, naming it", async () => {
    repo.sailingOfMasterJob.mockResolvedValue(sailing({ id: "other", vessel: "WEEK 52", voyage: "" }));
    await expect(service.link(SAILING, "MCZLCL00000007", USER)).rejects.toMatchObject({ code: "failed_precondition", message: "MCZLCL00000007 is the Master Job of sailing WEEK 52 already." });
    expect(repo.setMasterJobJudged).not.toHaveBeenCalled();
  });

  it("refuses one another sailing took at the same moment, in a sentence: the database keeps one sailing per Master Job", async () => {
    repo.setMasterJobJudged.mockRejectedValue(Object.assign(new Error("duplicate key"), { cause: { code: "23505", constraint: "co_loading_sailing_one_master_job" } }));
    await expect(service.link(SAILING, "MCZLCL00000007", USER)).rejects.toMatchObject({ code: "failed_precondition", message: "MCZLCL00000007 was made the Master Job of another sailing meanwhile: nothing was linked." });
  });

  it("does not find a number the company has no Master Job of, nor a sailing gone by the time it is locked", async () => {
    masterJobs.findByMczNumber.mockResolvedValue(null);
    await expect(service.link(SAILING, "MCZLCL99", USER)).rejects.toMatchObject({ code: "not_found" });
    masterJobs.findByMczNumber.mockResolvedValue(found);
    repo.setMasterJobJudged.mockResolvedValue(null);
    await expect(service.link(SAILING, "MCZLCL00000007", USER)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("a sailing's Master Job, read", () => {
  it("is none when the Master Job was deleted since", async () => {
    repo.get.mockResolvedValue(sailing({ masterJobId: "mj-gone" }));
    masterJobService.get.mockRejectedValue(APIError.notFound("Master job not found"));
    expect((await service.get(SAILING, COMPANY)).masterJob).toBeNull();
  });

  it("fails as it is when the Master Job cannot be read: never shown as none", async () => {
    repo.get.mockResolvedValue(sailing({ masterJobId: "mj-1" }));
    masterJobService.get.mockRejectedValue(new Error("db down"));
    await expect(service.get(SAILING, COMPANY)).rejects.toThrow("db down");
  });
});
