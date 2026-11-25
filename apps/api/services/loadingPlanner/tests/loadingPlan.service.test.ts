import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real - with the plan's rules - against a stand-in for the repository and
// for the shipments, quotes and auth services. What the repository's statements do to stored rows
// is not checked here (loadingPlan.repository.test).
const repository = vi.hoisted(() => ({
  listLatest: vi.fn(),
  searchMain: vi.fn(),
  getByIdForCompany: vi.fn(),
  createForCompany: vi.fn(),
  updateIfUnchanged: vi.fn(),
  softDeleteForCompany: vi.fn(),
  setLinkRef: vi.fn(),
  followQuoteRename: vi.fn(),
  moveQuote: vi.fn(),
}));
const clients = vi.hoisted(() => ({
  auth: { userLookup: vi.fn() },
  shipments: { _internalShipmentJobRef: vi.fn(), _internalSailingRef: vi.fn() },
  quotes: { _internalQuoteLinkRef: vi.fn() },
}));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => clients);
vi.mock("../repositories/loadingPlan.repository", () => ({ loadingPlanRepository: repository }));

import type { PlanInput } from "../interfaces/interfaces";
import { loadingPlanService } from "../services/loadingPlan.service";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PLAN = "33333333-3333-4333-8333-333333333333";
const SHIPMENT = "44444444-4444-4444-8444-444444444444";
const OTHER_SHIPMENT = "55555555-5555-4555-8555-555555555555";
const QUOTE = "66666666-6666-4666-8666-666666666666";
const REVISION = "77777777-7777-4777-8777-777777777777";
const SAILING = "88888888-8888-4888-8888-888888888888";
const OPENED = "2026-11-23T09:00:00.000Z";

const input = (more: Partial<PlanInput> = {}): PlanInput => ({ name: "Machines to Nhava Sheva", linkKind: null, linkId: null, linkRef: "", lines: [], nominated: null, ...more });
const linked = (more: Partial<PlanInput> = {}) => input({ linkKind: "shipment", linkId: SHIPMENT, linkRef: "CZ00000053", ...more });
const stored = (more: object = {}) => ({
  id: PLAN,
  companyId: COMPANY,
  ...input(),
  createdBy: "jana@example.com",
  updatedBy: "jana@example.com",
  createdAt: new Date("2026-11-23T08:00:00.000Z"),
  updatedAt: new Date(OPENED),
  deletedAt: null,
  ...more,
});

beforeEach(() => {
  vi.clearAllMocks();
  clients.auth.userLookup.mockResolvedValue({ users: [{ id: USER, email: "Petr@Example.com" }] });
  // The repository answers with the row it was given, as a database would.
  repository.createForCompany.mockImplementation(async (_company: string, data: Record<string, unknown>) => stored(data));
  repository.updateIfUnchanged.mockImplementation(async (_id: string, _company: string, _basedOn: Date, data: Record<string, unknown>) => stored({ ...data, updatedAt: new Date("2026-11-23T10:00:00.000Z") }));
});

describe("create", () => {
  it("checks the link with the shipments service and stores the job number it answers, not the one sent", async () => {
    clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: "CZLCL00000053" });
    const plan = await loadingPlanService.create(COMPANY, USER, linked({ linkRef: "made up" }));
    expect(clients.shipments._internalShipmentJobRef).toHaveBeenCalledWith({ shipmentId: SHIPMENT, withCargo: false });
    expect(repository.createForCompany).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ linkId: SHIPMENT, linkRef: "CZLCL00000053", createdBy: "petr@example.com", updatedBy: "petr@example.com" }));
    expect(plan).toMatchObject({ linkRef: "CZLCL00000053", linkGone: false });
  });

  it("checks a quote by its id and reference", async () => {
    clients.quotes._internalQuoteLinkRef.mockResolvedValue({ quoteNumber: "QCZLCL20261109001" });
    const plan = await loadingPlanService.create(COMPANY, USER, input({ linkKind: "quote", linkId: QUOTE, linkRef: "QCZ20261109001" }));
    expect(clients.quotes._internalQuoteLinkRef).toHaveBeenCalledWith({ quoteId: QUOTE, reference: "QCZ20261109001", withCargo: false });
    expect(plan.linkRef).toBe("QCZLCL20261109001");
  });

  it("refuses a plan linked to a job the company does not have, and saves nothing", async () => {
    clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: null });
    await expect(loadingPlanService.create(COMPANY, USER, linked())).rejects.toMatchObject({
      code: "invalid_argument",
      message: "The shipment this plan is linked to was not found. Link the plan again, or unlink it.",
    });
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });

  it("asks no service about a plan without a link", async () => {
    await loadingPlanService.create(COMPANY, USER, input());
    expect(clients.shipments._internalShipmentJobRef).not.toHaveBeenCalled();
    expect(clients.shipments._internalSailingRef).not.toHaveBeenCalled();
    expect(clients.quotes._internalQuoteLinkRef).not.toHaveBeenCalled();
  });

  it("checks a sailing's link with Co-Loading Concept and stores what the sailing is called now", async () => {
    clients.shipments._internalSailingRef.mockResolvedValue({ reference: "WEEK 51 · Import from Shanghai" });
    const plan = await loadingPlanService.create(COMPANY, USER, input({ linkKind: "sailing", linkId: SAILING, linkRef: "made up" }));
    expect(clients.shipments._internalSailingRef).toHaveBeenCalledWith({ sailingId: SAILING, withCargo: false });
    expect(clients.shipments._internalShipmentJobRef).not.toHaveBeenCalled();
    expect(repository.createForCompany).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ linkKind: "sailing", linkId: SAILING, linkRef: "WEEK 51 · Import from Shanghai" }));
    expect(plan).toMatchObject({ linkRef: "WEEK 51 · Import from Shanghai", linkGone: false });
  });

  it("refuses a plan linked to a sailing the company does not have, and saves nothing", async () => {
    clients.shipments._internalSailingRef.mockResolvedValue({ reference: null });
    await expect(loadingPlanService.create(COMPANY, USER, input({ linkKind: "sailing", linkId: SAILING, linkRef: "WEEK 51" }))).rejects.toMatchObject({
      code: "invalid_argument",
      message: "The sailing this plan is linked to was not found. Link the plan again, or unlink it.",
    });
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });

  it("refuses the plan, in a sentence of ours, when the owning service cannot be asked - and saves nothing", async () => {
    clients.quotes._internalQuoteLinkRef.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.7:4000"));
    await expect(loadingPlanService.create(COMPANY, USER, input({ linkKind: "quote", linkId: QUOTE, linkRef: "QCZ20261109001" }))).rejects.toMatchObject({
      code: "unavailable",
      message: "Whether the linked quote exists could not be checked just now, so the plan was not saved. Save it again in a moment.",
    });
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });

  it("refuses a plan without a name, in the words the screen uses", async () => {
    await expect(loadingPlanService.create(COMPANY, USER, input({ name: " " }))).rejects.toMatchObject({ code: "invalid_argument", message: "Give the plan a name before saving." });
  });
});

describe("update", () => {
  it("checks a link that changed, and refuses it when the job is unknown", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(linked()));
    clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: null });
    await expect(loadingPlanService.update(PLAN, COMPANY, USER, linked({ linkId: OTHER_SHIPMENT }), OPENED)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(clients.shipments._internalShipmentJobRef).toHaveBeenCalledWith({ shipmentId: OTHER_SHIPMENT, withCargo: false });
    expect(repository.updateIfUnchanged).not.toHaveBeenCalled();
  });

  it("refuses a changed link, in a sentence of ours, when the shipments service cannot be asked", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(linked()));
    clients.shipments._internalShipmentJobRef.mockRejectedValue(new Error("deadline exceeded"));
    await expect(loadingPlanService.update(PLAN, COMPANY, USER, linked({ linkId: OTHER_SHIPMENT }), OPENED)).rejects.toMatchObject({
      code: "unavailable",
      message: "Whether the linked shipment exists could not be checked just now, so the plan was not saved. Save it again in a moment.",
    });
    expect(repository.updateIfUnchanged).not.toHaveBeenCalled();
  });

  it("unlinks a plan saved without a link, asking no service about the job it had", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(linked()));
    const plan = await loadingPlanService.update(PLAN, COMPANY, USER, input({ linkRef: "CZ00000053" }), OPENED);
    expect(clients.shipments._internalShipmentJobRef).not.toHaveBeenCalled();
    expect(repository.updateIfUnchanged).toHaveBeenCalledWith(PLAN, COMPANY, new Date(OPENED), expect.objectContaining({ linkKind: null, linkId: null, linkRef: "" }));
    expect(plan).toMatchObject({ linkKind: null, linkId: null, linkRef: "", linkGone: false });
  });

  it("does not refuse a kept link whose job is gone: the plan is saved, still linked, and says so", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(linked()));
    clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: null });
    const plan = await loadingPlanService.update(PLAN, COMPANY, USER, linked({ name: "Renamed" }), OPENED);
    expect(repository.updateIfUnchanged).toHaveBeenCalledWith(PLAN, COMPANY, new Date(OPENED), expect.objectContaining({ name: "Renamed", linkId: SHIPMENT, linkRef: "CZ00000053", updatedBy: "petr@example.com" }));
    expect(plan).toMatchObject({ linkId: SHIPMENT, linkGone: true });
  });

  it("takes a kept link's reference from the server - what the job is called now - not from the browser", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(linked()));
    clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: "CZLCL00000053" });
    const plan = await loadingPlanService.update(PLAN, COMPANY, USER, linked({ linkRef: "made up" }), OPENED);
    expect(plan).toMatchObject({ linkRef: "CZLCL00000053", linkGone: false });
  });

  it("keeps the stored reference of a kept link when the owning service does not answer", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(linked()));
    clients.shipments._internalShipmentJobRef.mockRejectedValue(new Error("down"));
    const plan = await loadingPlanService.update(PLAN, COMPANY, USER, linked({ linkRef: "made up" }), OPENED);
    expect(plan).toMatchObject({ linkRef: "CZ00000053", linkGone: false });
  });

  it("refuses a save based on a version someone else has saved over, naming who and when", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored({ updatedBy: "jana@example.com", updatedAt: new Date("2026-11-23T09:30:00.000Z") }));
    await expect(loadingPlanService.update(PLAN, COMPANY, USER, input(), OPENED)).rejects.toMatchObject({
      code: "aborted",
      message: "This plan was changed by jana@example.com on 23 Nov 2026, 10:30 since you opened it. Reload it and save again.",
    });
    expect(repository.updateIfUnchanged).not.toHaveBeenCalled();
  });

  it("refuses the save that loses the race between the read and the write", async () => {
    // Unchanged when read; saved by someone else before the conditional update ran.
    repository.getByIdForCompany.mockResolvedValueOnce(stored()).mockResolvedValueOnce(stored({ updatedBy: "jana@example.com", updatedAt: new Date("2026-11-23T09:30:00.000Z") }));
    repository.updateIfUnchanged.mockResolvedValue(null);
    await expect(loadingPlanService.update(PLAN, COMPANY, USER, input(), OPENED)).rejects.toMatchObject({ code: "aborted", message: expect.stringContaining("changed by jana@example.com") });
  });

  it("refuses a save that does not say which version it is based on", async () => {
    await expect(loadingPlanService.update(PLAN, COMPANY, USER, input(), "")).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
  });

  it("is not found for another company's plan, and nothing is written", async () => {
    // The repository finds a plan only in the company it is asked for.
    repository.getByIdForCompany.mockResolvedValue(null);
    await expect(loadingPlanService.update(PLAN, COMPANY, USER, input(), OPENED)).rejects.toMatchObject({ code: "not_found", message: "Loading plan not found" });
    expect(repository.getByIdForCompany).toHaveBeenCalledWith(PLAN, COMPANY);
    expect(repository.updateIfUnchanged).not.toHaveBeenCalled();
  });
});

describe("get", () => {
  it("is not found for an id that is no id, without asking the database", async () => {
    await expect(loadingPlanService.get("not-an-id", COMPANY)).rejects.toMatchObject({ code: "not_found", message: "Loading plan not found" });
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
  });

  it("is not found for another company's plan", async () => {
    repository.getByIdForCompany.mockResolvedValue(null);
    await expect(loadingPlanService.get(PLAN, COMPANY)).rejects.toMatchObject({ code: "not_found" });
    expect(repository.getByIdForCompany).toHaveBeenCalledWith(PLAN, COMPANY);
  });

  it("shows what the linked job is called now and stores it when it changed", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(linked()));
    clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: "CZLCL00000053" });
    await expect(loadingPlanService.get(PLAN, COMPANY)).resolves.toMatchObject({ linkRef: "CZLCL00000053", linkGone: false, updatedAt: OPENED });
    expect(repository.setLinkRef).toHaveBeenCalledWith(PLAN, COMPANY, { kind: "shipment", id: SHIPMENT }, "CZLCL00000053");
  });

  it("says the linked job is gone, and leaves the plan linked", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(input({ linkKind: "quote", linkId: QUOTE, linkRef: "QCZ20261109001" })));
    clients.quotes._internalQuoteLinkRef.mockResolvedValue({ quoteNumber: null });
    await expect(loadingPlanService.get(PLAN, COMPANY)).resolves.toMatchObject({ linkKind: "quote", linkId: QUOTE, linkRef: "QCZ20261109001", linkGone: true });
    expect(repository.setLinkRef).not.toHaveBeenCalled();
  });

  it("opens the plan as it is stored when the owning service does not answer, without the job's cargo", async () => {
    repository.getByIdForCompany.mockResolvedValue(stored(linked()));
    clients.shipments._internalShipmentJobRef.mockRejectedValue(new Error("down"));
    await expect(loadingPlanService.get(PLAN, COMPANY)).resolves.toMatchObject({ linkRef: "CZ00000053", linkGone: false, jobCargo: null });
    expect(repository.setLinkRef).not.toHaveBeenCalled();
  });

  describe("with the linked job's cargo as it is now (Council Outlay 14, P3)", () => {
    const dimension = { pieces: "4", lengthCm: "120", widthCm: "80", heightCm: "150", weightPerPcKg: "450", packageType: "Pallet(s)", stackable: "" };

    it("gives a shipment's cargo as the shipments service answers it", async () => {
      repository.getByIdForCompany.mockResolvedValue(stored(linked()));
      const cargo = { cargoDimensions: [dimension], bookedDimensions: [] };
      clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: "CZ00000053", cargo });
      await expect(loadingPlanService.get(PLAN, COMPANY)).resolves.toMatchObject({ linkGone: false, jobCargo: { shipment: cargo } });
      expect(clients.shipments._internalShipmentJobRef).toHaveBeenCalledWith({ shipmentId: SHIPMENT, withCargo: true });
    });

    it("gives a quote's package lines", async () => {
      repository.getByIdForCompany.mockResolvedValue(stored(input({ linkKind: "quote", linkId: QUOTE, linkRef: "QCZ20261109001" })));
      const packages = [{ qty: 4, type: "Pallets", length: 120, width: 80, height: 150, weight: 450 }];
      clients.quotes._internalQuoteLinkRef.mockResolvedValue({ quoteNumber: "QCZ20261109001", packages });
      await expect(loadingPlanService.get(PLAN, COMPANY)).resolves.toMatchObject({ jobCargo: { quote: { packages } } });
      expect(clients.quotes._internalQuoteLinkRef).toHaveBeenCalledWith({ quoteId: QUOTE, reference: "QCZ20261109001", withCargo: true });
    });

    it("gives a sailing's box", async () => {
      repository.getByIdForCompany.mockResolvedValue(stored(input({ linkKind: "sailing", linkId: SAILING, linkRef: "WEEK 51" })));
      const box = { sailingId: SAILING, serviceId: "s1", reference: "WEEK 51 · Import from Shanghai", containerType: "40' HC", containerCount: 1, shipments: [] };
      clients.shipments._internalSailingRef.mockResolvedValue({ reference: "WEEK 51 · Import from Shanghai", cargo: box });
      await expect(loadingPlanService.get(PLAN, COMPANY)).resolves.toMatchObject({ linkRef: "WEEK 51 · Import from Shanghai", jobCargo: { sailing: box } });
      expect(clients.shipments._internalSailingRef).toHaveBeenCalledWith({ sailingId: SAILING, withCargo: true });
    });

    it("gives none for a job that is gone, and asks nothing for a plan without a link", async () => {
      repository.getByIdForCompany.mockResolvedValue(stored(linked()));
      clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: null });
      await expect(loadingPlanService.get(PLAN, COMPANY)).resolves.toMatchObject({ linkGone: true, jobCargo: null });
      vi.clearAllMocks();
      repository.getByIdForCompany.mockResolvedValue(stored());
      await expect(loadingPlanService.get(PLAN, COMPANY)).resolves.toMatchObject({ linkKind: null, jobCargo: null });
      expect(clients.shipments._internalShipmentJobRef).not.toHaveBeenCalled();
      expect(clients.quotes._internalQuoteLinkRef).not.toHaveBeenCalled();
    });

    it("is not part of a save's answer, and a save does not ask for it", async () => {
      repository.getByIdForCompany.mockResolvedValue(stored(linked()));
      clients.shipments._internalShipmentJobRef.mockResolvedValue({ jobNumber: "CZ00000053" });
      const plan = await loadingPlanService.update(PLAN, COMPANY, USER, linked(), OPENED);
      expect(plan).not.toHaveProperty("jobCargo");
      expect(clients.shipments._internalShipmentJobRef).toHaveBeenCalledWith({ shipmentId: SHIPMENT, withCargo: false });
    });
  });
});

describe("the main search", () => {
  it("is the repository's search of the company's plans, with how many match in all", async () => {
    const row = { id: PLAN, name: "Plzeň machines", linkKind: null, linkId: null, linkRef: "", colli: 12, weightKg: 6005, result: null, createdBy: "a@example.com", updatedBy: "b@example.com", createdAt: new Date(OPENED), updatedAt: new Date(OPENED) };
    repository.searchMain.mockResolvedValue({ rows: [row], total: 731 });
    await expect(loadingPlanService.searchMain(COMPANY, "plzen", 5)).resolves.toEqual({ items: [{ ...row, createdAt: OPENED, updatedAt: OPENED }], total: 731 });
    expect(repository.searchMain).toHaveBeenCalledWith(COMPANY, "plzen", 5);
    expect(repository.listLatest).not.toHaveBeenCalled();
  });
});

describe("list, delete and a revised quote", () => {
  it("lists the rows with their sums and says when there are more", async () => {
    const row = { id: PLAN, name: "Machines", linkKind: null, linkId: null, linkRef: "", colli: 12, weightKg: 6005, createdBy: "a@example.com", updatedBy: "b@example.com", createdAt: new Date(OPENED), updatedAt: new Date(OPENED) };
    repository.listLatest.mockResolvedValue({ rows: [row], capped: true });
    await expect(loadingPlanService.list(COMPANY)).resolves.toEqual({ plans: [{ ...row, createdAt: OPENED, updatedAt: OPENED }], capped: true });
  });

  it("is not found when deleting an id that is no id, or another company's plan", async () => {
    await expect(loadingPlanService.softDelete("1", COMPANY)).rejects.toMatchObject({ code: "not_found" });
    expect(repository.softDeleteForCompany).not.toHaveBeenCalled();
    repository.softDeleteForCompany.mockResolvedValue(null);
    await expect(loadingPlanService.softDelete(PLAN, COMPANY)).rejects.toMatchObject({ code: "not_found" });
  });

  it("moves the plans of a revised quote to its revision, as a save by who revised it", async () => {
    repository.moveQuote.mockResolvedValue(2);
    await expect(loadingPlanService.moveQuote(COMPANY, USER, QUOTE, { id: REVISION, reference: " QCZLCL20261109001-R1 " })).resolves.toBe(2);
    expect(repository.moveQuote).toHaveBeenCalledWith(COMPANY, QUOTE, { id: REVISION, reference: "QCZLCL20261109001-R1" }, "petr@example.com");
    await expect(loadingPlanService.moveQuote(COMPANY, USER, "nope", { id: REVISION, reference: "X" })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("moves nothing when a quote is moved onto itself", async () => {
    await expect(loadingPlanService.moveQuote(COMPANY, USER, QUOTE, { id: QUOTE, reference: "QCZ20261109001" })).resolves.toBe(0);
    expect(repository.moveQuote).not.toHaveBeenCalled();
  });
});
