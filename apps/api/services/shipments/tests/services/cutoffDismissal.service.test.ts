import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ liveByShipmentIds: vi.fn(), listForShipment: vi.fn(), findLive: vi.fn(), createWithHistory: vi.fn(), takeBack: vi.fn() }));
const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const events = vi.hoisted(() => ({ factsOfKinds: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn(async () => ({ users: [{ id: "m", name: "Eva Malá" }] })) } }));
vi.mock("../../repositories/shipmentCutoffDismissal.repository", () => ({ shipmentCutoffDismissalRepository: repo }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: events }));

import { DISMISSALS_NOT_KNOWN, cutoffDismissalsOf } from "../../services/cutoffDismissal.service";
import { cutoffDismissalActionsService as actions } from "../../services/cutoffDismissalActions.service";

// Dismissing a missed cut-off, against stand-ins for the repositories: only what the shared rule
// calls missed right now, stored with its date, once. The rule is tests/cutoffDismissals.test.ts.

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const ID = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const manager = { userID: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02", companyID: "c1", role: "manager" };
// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");

const job = (over = {}) => ({
  id: SHIPMENT,
  jobNumber: "CZFCL00000001",
  estimatedDeparture: "2026-11-20",
  actualDeparture: null,
  actualArrival: null,
  actualDeliveryDate: null,
  warehouseReceivedDate: null,
  closingDate: null,
  closingTime: "",
  vgmClosing: null,
  vgmClosingTime: "",
  vgm: "",
  siClosing: null,
  siClosingTime: "",
  shippingInstructions: "",
  ams: "",
  amsDeadline: null,
  amsDeadlineTime: "",
  isf: "",
  isfDeadline: null,
  isfDeadlineTime: "",
  ...over,
});
const dismissal = (over = {}) => ({
  id: ID,
  companyId: "c1",
  shipmentId: SHIPMENT,
  cutoff: "siClosing",
  cutoffDate: "2026-11-17",
  reason: "Carrier took the SI late",
  dismissedById: manager.userID,
  dismissedByName: "Eva Malá",
  createdAt: new Date("2026-11-18T10:00:00Z"),
  updatedAt: new Date("2026-11-18T10:00:00Z"),
  deletedAt: null,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  shipments.getByIdForCompany.mockResolvedValue(job({ siClosing: "2026-11-17" }));
  events.factsOfKinds.mockResolvedValue([]);
  repo.createWithHistory.mockImplementation(async (values) => dismissal(values));
});

describe("cutoffDismissalsOf: the read both pages share", () => {
  it("gives the live dismissals by shipment, in one query; a job with none has no entry", async () => {
    repo.liveByShipmentIds.mockResolvedValue([
      { shipmentId: "a", cutoff: "closingDate", cutoffDate: "2026-11-16" },
      { shipmentId: "a", cutoff: "vgmClosing", cutoffDate: "2026-11-17" },
      { shipmentId: "b", cutoff: "siClosing", cutoffDate: "2026-11-17" },
    ]);
    const byJob = await cutoffDismissalsOf("c1", ["a", "b", "c"]);
    expect(repo.liveByShipmentIds).toHaveBeenCalledTimes(1);
    expect(repo.liveByShipmentIds).toHaveBeenCalledWith(["a", "b", "c"], "c1");
    expect(byJob.get("a")).toEqual([{ cutoff: "closingDate", date: "2026-11-16" }, { cutoff: "vgmClosing", date: "2026-11-17" }]);
    expect(byJob.get("b")).toEqual([{ cutoff: "siClosing", date: "2026-11-17" }]);
    expect(byJob.has("c")).toBe(false);
  });

  it("throws when the read fails: the caller names it and treats nothing as dismissed", async () => {
    repo.liveByShipmentIds.mockRejectedValue(new Error("the table is away"));
    await expect(cutoffDismissalsOf("c1", ["a"])).rejects.toThrow("the table is away");
    expect(DISMISSALS_NOT_KNOWN).toBe("dismissed cut-offs");
  });
});

describe("dismissing a missed cut-off", () => {
  it("stores the cut-off with the date it has, the reason and who, and a line in the job's history", async () => {
    const item = await actions.dismiss(manager, SHIPMENT, { cutoff: "siClosing", reason: " Carrier took the SI late " }, NOW);
    expect(repo.createWithHistory).toHaveBeenCalledWith(
      { companyId: "c1", shipmentId: SHIPMENT, cutoff: "siClosing", cutoffDate: "2026-11-17", reason: "Carrier took the SI late", dismissedById: manager.userID, dismissedByName: "Eva Malá" },
      { userId: manager.userID, field: "cutoffDismissed", oldValue: null, newValue: "SI 17.11.2026: Carrier took the SI late" },
    );
    expect(item).toMatchObject({ id: ID, cutoff: "siClosing", cutoffDate: "2026-11-17", reason: "Carrier took the SI late", dismissedByName: "Eva Malá" });
    // A filing's miss does not hang on the cargo: no events are read.
    expect(events.factsOfKinds).not.toHaveBeenCalled();
  });

  it("dismisses a filing overdue since its time today, and AMS by the 4 days before the ETD when no deadline is typed", async () => {
    shipments.getByIdForCompany.mockResolvedValue(job({ vgmClosing: "2026-11-18", vgmClosingTime: "10:00", ams: "Pending" }));
    await actions.dismiss(manager, SHIPMENT, { cutoff: "vgmClosing", reason: "Sent by phone" }, NOW);
    expect(repo.createWithHistory.mock.lastCall![0]).toMatchObject({ cutoff: "vgmClosing", cutoffDate: "2026-11-18" });
    await actions.dismiss(manager, SHIPMENT, { cutoff: "amsDeadline", reason: "Not a US job after all" }, NOW);
    expect(repo.createWithHistory.mock.lastCall![0]).toMatchObject({ cutoff: "amsDeadline", cutoffDate: "2026-11-16" });
  });

  it("refuses a cut-off that is not missed right now: due, done, or not on the job", async () => {
    shipments.getByIdForCompany.mockResolvedValue(job({ siClosing: "2026-11-19", vgmClosing: "2026-11-17", vgm: "Confirmed (Green)" }));
    for (const cutoff of ["siClosing", "vgmClosing", "isfDeadline"]) {
      await expect(actions.dismiss(manager, SHIPMENT, { cutoff, reason: "It is settled" }, NOW)).rejects.toMatchObject({
        code: "failed_precondition",
        message: expect.stringContaining("is not missed or overdue on this job right now: only a missed cut-off can be dismissed"),
      });
    }
    expect(repo.createWithHistory).not.toHaveBeenCalled();
  });

  it("refuses a cut-off of a job that has left: it has none any more", async () => {
    shipments.getByIdForCompany.mockResolvedValue(job({ siClosing: "2026-11-17", actualDeparture: "2026-11-18" }));
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "siClosing", reason: "It is settled" }, NOW)).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("dismisses a missed Closing only when the cargo did not make it: the timeline is read for it", async () => {
    shipments.getByIdForCompany.mockResolvedValue(job({ closingDate: "2026-11-16" }));
    await actions.dismiss(manager, SHIPMENT, { cutoff: "closingDate", reason: "Goes on the next vessel" }, NOW);
    expect(events.factsOfKinds).toHaveBeenCalledWith([SHIPMENT], "c1", ["picked_up", "loaded", "gate_in"]);
    expect(repo.createWithHistory.mock.lastCall![1]).toMatchObject({ newValue: "Closing 16.11.2026: Goes on the next vessel" });

    events.factsOfKinds.mockResolvedValue([{ shipmentId: SHIPMENT, kind: "gate_in", occurredOn: "2026-11-15", effect: "", resolvedAt: null, createdAt: new Date("2026-11-15T08:00:00Z") }]);
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "closingDate", reason: "Goes on the next vessel" }, NOW)).rejects.toThrow("Closing is not missed or overdue");

    // Received at our warehouse: the cargo is in, whatever the timeline says - and it is not read.
    events.factsOfKinds.mockClear();
    shipments.getByIdForCompany.mockResolvedValue(job({ closingDate: "2026-11-16", warehouseReceivedDate: "2026-11-15" }));
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "closingDate", reason: "Goes on the next vessel" }, NOW)).rejects.toThrow("Closing is not missed or overdue");
    expect(events.factsOfKinds).not.toHaveBeenCalled();
  });

  it("says so when it can't tell whether the cargo made its Closing, and writes nothing", async () => {
    shipments.getByIdForCompany.mockResolvedValue(job({ closingDate: "2026-11-16" }));
    events.factsOfKinds.mockRejectedValue(new Error("the events table is locked"));
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "closingDate", reason: "Goes on the next vessel" }, NOW)).rejects.toMatchObject({
      code: "unavailable",
      message: "Whether the cargo made its Closing could not be read just now: try again in a moment",
    });
    expect(repo.createWithHistory).not.toHaveBeenCalled();
  });

  it("answers the dismissal that stands on a second click, and writes nothing again", async () => {
    repo.createWithHistory.mockResolvedValue(null);
    repo.findLive.mockResolvedValue(dismissal({ reason: "The first reason" }));
    const item = await actions.dismiss(manager, SHIPMENT, { cutoff: "siClosing", reason: "Carrier took the SI late" }, NOW);
    expect(item).toMatchObject({ id: ID, reason: "The first reason" });
    expect(repo.findLive).toHaveBeenCalledWith("c1", SHIPMENT, "siClosing", "2026-11-17");
    // Taken back between the two reads: asked again.
    repo.findLive.mockResolvedValue(null);
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "siClosing", reason: "Carrier took the SI late" }, NOW)).rejects.toMatchObject({ code: "aborted" });
  });

  it("wants one of the five cut-offs and a reason, and a shipment of the company", async () => {
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "estimatedDeparture", reason: "It is settled" }, NOW)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "cutoff must be one of closingDate, vgmClosing, siClosing, amsDeadline, isfDeadline",
    });
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "siClosing", reason: " ok " }, NOW)).rejects.toThrow("Say why the missed cut-off is dismissed");
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "siClosing", reason: "x".repeat(501) }, NOW)).rejects.toThrow("too long");
    expect(shipments.getByIdForCompany).not.toHaveBeenCalled();
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(actions.dismiss(manager, SHIPMENT, { cutoff: "siClosing", reason: "It is settled" }, NOW)).rejects.toMatchObject({ code: "not_found" });
    await expect(actions.dismiss(manager, "s1", { cutoff: "siClosing", reason: "It is settled" }, NOW)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("taking a dismissal back", () => {
  it("ends it with a line in the job's history that says what was taken back", async () => {
    repo.takeBack.mockImplementation(async (_id, _shipmentId, _companyId, history) => {
      expect(history(dismissal())).toEqual({ userId: manager.userID, field: "cutoffDismissed", oldValue: "SI 17.11.2026: Carrier took the SI late", newValue: "taken back: SI 17.11.2026" });
      return dismissal({ deletedAt: new Date() });
    });
    await actions.takeBack(manager, SHIPMENT, ID);
    expect(repo.takeBack).toHaveBeenCalledWith(ID, SHIPMENT, "c1", expect.any(Function));
  });

  it("is fine twice (the second finds nothing to do), and refuses what is no id", async () => {
    repo.takeBack.mockResolvedValue(null);
    await expect(actions.takeBack(manager, SHIPMENT, ID)).resolves.toBeUndefined();
    await expect(actions.takeBack(manager, SHIPMENT, "d1")).rejects.toMatchObject({ code: "not_found" });
    await expect(actions.takeBack(manager, "s1", ID)).rejects.toMatchObject({ code: "not_found" });
    expect(repo.takeBack).toHaveBeenCalledTimes(1);
  });
});

describe("a job's live dismissals", () => {
  it("are listed for a shipment of the company", async () => {
    repo.listForShipment.mockResolvedValue([dismissal()]);
    expect(await actions.list(manager, SHIPMENT)).toEqual([
      { id: ID, shipmentId: SHIPMENT, cutoff: "siClosing", cutoffDate: "2026-11-17", reason: "Carrier took the SI late", dismissedByName: "Eva Malá", dismissedAt: "2026-11-18T10:00:00.000Z" },
    ]);
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(actions.list(manager, SHIPMENT)).rejects.toMatchObject({ code: "not_found" });
  });
});
