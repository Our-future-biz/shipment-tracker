import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn(), findByMasterJobId: vi.fn() }));
const auditRows = vi.hoisted(() => ({ listByShipmentId: vi.fn(), create: vi.fn() }));
const taskRows = vi.hoisted(() => ({ listByShipmentId: vi.fn(), upsert: vi.fn() }));
const service = vi.hoisted(() => ({ isInvoiced: vi.fn(), customsStatusOf: vi.fn(), customsStatusesOf: vi.fn(), mayChangeDetails: vi.fn(), update: vi.fn() }));
const masterJobs = vi.hoisted(() => ({ update: vi.fn(), assertMayChangeEveryHouse: vi.fn() }));
const comments = vi.hoisted(() => ({ postExceptionNotice: vi.fn() }));
const attachments = vi.hoisted(() => ({ addFromModule: vi.fn() }));
const containers = vi.hoisted(() => ({ listByShipmentId: vi.fn(async () => [] as object[]), setFreeTime: vi.fn(), byNumbers: vi.fn() }));
const dbTx = vi.hoisted(() => ({ transaction: vi.fn() }));
const events = vi.hoisted(() => ({
  listByShipmentId: vi.fn(),
  getLive: vi.fn(),
  findSameDay: vi.fn(),
  latestOfKind: vi.fn(),
  latestPerShipment: vi.fn(),
  add: vi.fn(),
  change: vi.fn(),
  resolveOpen: vi.fn(),
  softDeleteForCompany: vi.fn(),
  addOnce: vi.fn(),
  ofKinds: vi.fn(),
}));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map([["u1", "jana@firma.cz"]]) }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: auditRows }));
vi.mock("../../repositories/shipmentTask.repository", () => ({ shipmentTaskRepository: taskRows }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: events }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: service }));
vi.mock("../../services/masterJob.service", () => ({ masterJobService: masterJobs }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: { listByShipmentId: vi.fn(async () => []) } }));
vi.mock("../../services/comment.service", () => ({ commentService: comments }));
vi.mock("../../services/attachment.service", () => ({ attachmentService: attachments }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: containers }));
vi.mock("../../db/db", () => ({ db: dbTx }));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: { getByIdForCompany: vi.fn(async () => ({ id: "m1" })) } }));

import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { CUSTOMS_CLEARED } from "../../lib/trackingEvents";
import { TRACKING_AUDIT_FIELDS } from "../../lib/trackingTimeline";
import { TRACKING_CHANGES_LIMIT, trackingService } from "../../services/tracking.service";

const shipment = {
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "",
  pol: "",
  pod: "",
  destination: "",
  hub: "",
  customsStatus: "",
  customsDeadline: "",
  mrn: "",
  estimatedArrival: "2026-12-09",
  id: "s1",
  masterJobId: null as string | null,
  actualArrival: null as string | null,
  actualDeparture: null as string | null,
  actualDeliveryDate: null as string | null,
};
const ACTOR = { userID: "u1", companyID: "c1", role: "user" };
const EDITOR = { userID: "u1", role: "user" };
const NOW = new Date("2026-11-06T12:00:00Z");
const record = (input: Partial<Parameters<typeof trackingService.record>[2]> = {}) =>
  trackingService.record("s1", ACTOR, { kind: "arrived", occurredOn: "2026-11-05", ...input }, NOW);
const change = (id: number) => ({ id: `a${id}`, field: "vessel", oldValue: "", newValue: "X", changedAt: new Date("2026-11-01T10:00:00Z"), userId: "u1" });

beforeEach(() => {
  vi.clearAllMocks();
  shipments.getByIdForCompany.mockResolvedValue(shipment);
  auditRows.listByShipmentId.mockResolvedValue([]);
  taskRows.listByShipmentId.mockResolvedValue([]);
  service.isInvoiced.mockResolvedValue(false);
  service.customsStatusOf.mockResolvedValue("Waiting For Commercial Paperwork");
  service.mayChangeDetails.mockResolvedValue(true);
  events.listByShipmentId.mockResolvedValue([]);
  containers.listByShipmentId.mockResolvedValue([]);
  events.findSameDay.mockResolvedValue(null);
  events.add.mockImplementation(async (row: object) => ({ id: "new", ...row }));
  events.change.mockImplementation(async (id: string) => ({ id }));
});

describe("the shipment's tracking", () => {
  it("is not found for a shipment that isn't live in this company", async () => {
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(trackingService.get("s1", ACTOR)).rejects.toThrow("Shipment not found");
    expect(auditRows.listByShipmentId).not.toHaveBeenCalled();
  });

  it("reads the transport fields of this shipment and company, one row past the limit", async () => {
    await trackingService.get("s1", ACTOR);
    expect(auditRows.listByShipmentId).toHaveBeenCalledWith("s1", "c1", TRACKING_AUDIT_FIELDS, TRACKING_CHANGES_LIMIT + 1);
  });

  it("shows the customs status worked out from the paperwork", async () => {
    const t = await trackingService.get("s1", ACTOR);
    expect(service.customsStatusOf).toHaveBeenCalledWith(shipment, "c1");
    expect(t.milestones.find((m) => m.key === "customs")?.detail).toBe("Waiting For Commercial Paperwork");
  });

  it("says when the log holds more than it read", async () => {
    auditRows.listByShipmentId.mockResolvedValue(Array.from({ length: TRACKING_CHANGES_LIMIT + 1 }, (_, i) => change(i)));
    const t = await trackingService.get("s1", ACTOR);
    expect(t.changes).toHaveLength(TRACKING_CHANGES_LIMIT);
    expect(t.changesCapped).toBe(true);
  });

  it("still answers when Invoicing can't be asked, without saying invoiced or not", async () => {
    service.isInvoiced.mockRejectedValue(new Error("down"));
    const t = await trackingService.get("s1", ACTOR);
    expect(t.taxDate.invoiced).toBeNull();
    expect(t.milestones.length).toBeGreaterThan(0);
  });
});

describe("recording an event", () => {
  it("sets the shipment's field through the normal update, under the person's role", async () => {
    await record({ note: "On the berth" });
    expect(service.update).toHaveBeenCalledWith("s1", "c1", { actualArrival: "2026-11-05" }, "u1", "user");
    expect(events.add).toHaveBeenCalledWith(expect.objectContaining({ kind: "arrived", occurredOn: "2026-11-05", effect: "applied", effectField: "actualArrival", effectValue: "2026-11-05", source: "user", note: "On the berth" }));
  });

  it("leaves no event when the update refuses, as it does on an invoiced job", async () => {
    service.update.mockRejectedValueOnce(new Error("credit the invoice first"));
    await expect(record()).rejects.toThrow("credit the invoice first");
    expect(events.add).not.toHaveBeenCalled();
  });

  it("writes a date a master job carries on the master job, held to every house's rule", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, masterJobId: "m1" });
    await record();
    expect(masterJobs.update).toHaveBeenCalledWith("m1", "c1", { actualArrival: "2026-11-05" }, "u1", EDITOR);
    expect(service.update).not.toHaveBeenCalled();
  });

  it("leaves no event when the master job refuses a house the person may not change", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, masterJobId: "m1" });
    masterJobs.update.mockRejectedValueOnce(APIError.permissionDenied("Only the Person in Charge, Holiday Cover or a manager can change CZ2"));
    await expect(record()).rejects.toThrow("CZ2");
    expect(events.add).not.toHaveBeenCalled();
    expect(events.change).not.toHaveBeenCalled();
  });

  it("takes no source's event for the bare fact, a confirmed proposal included", async () => {
    events.findSameDay.mockResolvedValue({ id: "doc", note: "", place: "", containerNumber: "", occurredAt: null, source: "document", externalId: "document:arrived:2026-11-05:" });
    await record({ place: "Charleston" });
    expect(events.change).not.toHaveBeenCalled();
    expect(events.add).toHaveBeenCalledWith(expect.objectContaining({ kind: "arrived", source: "user", place: "Charleston" }));
  });

  it("puts customs clearance on the day the person gives, as the one fact the write stored", async () => {
    events.latestOfKind.mockResolvedValue({ id: "bare", kind: "customs_released", occurredOn: "2026-11-06", note: "", place: "", containerNumber: "", occurredAt: null, externalId: "" });
    await record({ kind: "customs_released", occurredOn: "2026-11-05" });
    expect(service.update).toHaveBeenCalledWith("s1", "c1", { customsStatus: CUSTOMS_CLEARED }, "u1", "user");
    expect(events.latestOfKind).toHaveBeenCalledWith("s1", "c1", "customs_released");
    expect(events.findSameDay).not.toHaveBeenCalled();
    expect(events.change).toHaveBeenCalledWith("bare", "c1", expect.objectContaining({ occurredOn: "2026-11-05", source: "user", effect: "applied" }));
    expect(events.add).not.toHaveBeenCalled();
    expect(events.resolveOpen).toHaveBeenCalledWith("s1", "c1", ["hold"], "u1");
  });

  it("adds its details to the bare fact the write just stored, rather than a second one", async () => {
    events.findSameDay.mockResolvedValue({ id: "bare", note: "", place: "", containerNumber: "", occurredAt: null, source: "master_job" });
    const row = await record({ occurredTime: "14:30", place: "Charleston" });
    expect(row.id).toBe("bare");
    expect(events.add).not.toHaveBeenCalled();
    expect(events.change).toHaveBeenCalledWith("bare", "c1", expect.objectContaining({ place: "Charleston", occurredAt: new Date("2026-11-05T13:30:00Z"), source: "user" }));
  });

  it("keeps a fact somebody already gave details of, and adds another", async () => {
    events.findSameDay.mockResolvedValue({ id: "other", note: "", place: "", containerNumber: "MSDU2778315", occurredAt: null, source: "user" });
    await record({ containerNumber: "MSDU2778316" });
    expect(events.change).not.toHaveBeenCalled();
    expect(events.add).toHaveBeenCalled();
  });

  it("doesn't write a field that already holds the date", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, actualArrival: "2026-11-05" });
    await record();
    expect(service.update).not.toHaveBeenCalled();
    expect(events.add).toHaveBeenCalled();
  });

  it("writes nothing on the shipment for a fact it has no column for", async () => {
    await record({ kind: "discharged" });
    expect(service.update).not.toHaveBeenCalled();
    expect(events.add).toHaveBeenCalledWith(expect.objectContaining({ kind: "discharged", effect: "none", effectField: "" }));
  });

  it("closes the exceptions the fact ends", async () => {
    await record();
    expect(events.resolveOpen).toHaveBeenCalledWith("s1", "c1", ["delayed", "rolled"], "u1");
  });

  it("refuses who may not change the details, before anything is written", async () => {
    service.mayChangeDetails.mockResolvedValue(false);
    await expect(record()).rejects.toThrow("Only this shipment's Person in Charge");
    expect(service.update).not.toHaveBeenCalled();
    expect(events.add).not.toHaveBeenCalled();
  });

  it("lets anyone record customs' own kinds", async () => {
    service.mayChangeDetails.mockResolvedValue(false);
    await record({ kind: "hold", note: "MRN pending" });
    expect(events.add).toHaveBeenCalled();
  });

  it("tells the chat of an exception, and of nothing else", async () => {
    await record({ kind: "rolled", note: "No space" });
    expect(comments.postExceptionNotice).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), "c1", "u1", { label: "Rolled", day: "2026-11-05", note: "No space" });
    comments.postExceptionNotice.mockClear();
    await record({ kind: "discharged" });
    expect(comments.postExceptionNotice).not.toHaveBeenCalled();
  });

  it("keeps the exception when the chat can't be written", async () => {
    comments.postExceptionNotice.mockRejectedValueOnce(new Error("users away"));
    await expect(record({ kind: "rolled", note: "No space" })).resolves.toMatchObject({ kind: "rolled" });
  });

  it("refuses a date or a time that isn't one", async () => {
    await expect(record({ occurredOn: "2026-02-31" })).rejects.toThrow("YYYY-MM-DD");
    await expect(record({ occurredTime: "25:00" })).rejects.toThrow("HH:MM");
  });

  it("ticks the task it comes with, and only one that goes with it", async () => {
    await record({ taskKey: "imp_cargo_shipped", kind: "departed" });
    expect(taskRows.upsert).toHaveBeenCalledWith("s1", "c1", "imp_cargo_shipped", true, "u1");
    await expect(record({ taskKey: "imp_billed" })).rejects.toThrow("doesn't go with");
  });
});

describe("a proposed date", () => {
  const proposal = { id: "e1", kind: "arrived", effect: "proposed", effectField: "actualArrival", effectValue: "2026-11-05", occurredOn: "2026-11-05", source: "carrier" };

  it("confirmed on a house, goes on the master job held to every house's rule", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, masterJobId: "m1" });
    events.getLive.mockResolvedValue(proposal);
    await trackingService.confirm("s1", "e1", ACTOR);
    expect(masterJobs.update).toHaveBeenCalledWith("m1", "c1", { actualArrival: "2026-11-05" }, "u1", EDITOR);
  });

  it("reaches the shipment only when confirmed, through the normal update", async () => {
    events.getLive.mockResolvedValue(proposal);
    await trackingService.confirm("s1", "e1", ACTOR);
    expect(service.update).toHaveBeenCalledWith("s1", "c1", { actualArrival: "2026-11-05" }, "u1", "user");
    expect(events.change).toHaveBeenCalledWith("e1", "c1", expect.objectContaining({ effect: "applied", decidedById: "u1" }));
  });

  it("stays proposed when the update refuses the confirmation", async () => {
    events.getLive.mockResolvedValue(proposal);
    service.update.mockRejectedValueOnce(new Error("credit the invoice first"));
    await expect(trackingService.confirm("s1", "e1", ACTOR)).rejects.toThrow("credit the invoice first");
    expect(events.change).not.toHaveBeenCalled();
  });

  it("takes the details rule to confirm or dismiss", async () => {
    events.getLive.mockResolvedValue(proposal);
    service.mayChangeDetails.mockResolvedValue(false);
    await expect(trackingService.confirm("s1", "e1", ACTOR)).rejects.toThrow("Only this shipment's Person in Charge");
    await expect(trackingService.dismiss("s1", "e1", ACTOR)).rejects.toThrow("Only this shipment's Person in Charge");
  });

  it("leaves the shipment alone when dismissed", async () => {
    events.getLive.mockResolvedValue(proposal);
    await trackingService.dismiss("s1", "e1", ACTOR);
    expect(service.update).not.toHaveBeenCalled();
    expect(events.change).toHaveBeenCalledWith("e1", "c1", expect.objectContaining({ effect: "dismissed" }));
  });

  it("can't be confirmed once it isn't waiting", async () => {
    events.getLive.mockResolvedValue({ ...proposal, effect: "applied" });
    await expect(trackingService.confirm("s1", "e1", ACTOR)).rejects.toThrow("isn't waiting");
  });
});

describe("closing and striking", () => {
  it("closes an exception, and only an exception", async () => {
    events.getLive.mockResolvedValue({ id: "e1", kind: "rolled", resolvedAt: null, source: "user" });
    await trackingService.resolve("s1", "e1", ACTOR);
    expect(events.change).toHaveBeenCalledWith("e1", "c1", expect.objectContaining({ resolvedById: "u1" }));
    events.getLive.mockResolvedValue({ id: "e2", kind: "arrived", resolvedAt: null, source: "user" });
    await expect(trackingService.resolve("s1", "e2", ACTOR)).rejects.toThrow("Only an exception");
  });

  const hand = { id: "e1", kind: "arrived", source: "user", effect: "applied", effectField: "actualArrival", effectValue: "2026-11-05", occurredOn: "2026-11-05" };

  it("clears the date a struck event set, and keeps the reason in the log", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, actualArrival: "2026-11-05" });
    events.getLive.mockResolvedValue(hand);
    await trackingService.strike("s1", "e1", "Wrong job", ACTOR);
    expect(service.update).toHaveBeenCalledWith("s1", "c1", { actualArrival: "" }, "u1", "user");
    expect(events.softDeleteForCompany).toHaveBeenCalledWith("e1", "c1");
    expect(auditRows.create).toHaveBeenCalledWith(expect.objectContaining({ field: "trackingEvent:arrived", oldValue: "2026-11-05", newValue: "struck: Wrong job" }));
  });

  it("leaves a date somebody has changed since", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, actualArrival: "2026-11-06" });
    events.getLive.mockResolvedValue(hand);
    await trackingService.strike("s1", "e1", "Wrong", ACTOR);
    expect(service.update).not.toHaveBeenCalled();
    expect(events.softDeleteForCompany).toHaveBeenCalled();
  });

  it("stays when the date can't be cleared, as on an invoiced job", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, actualArrival: "2026-11-05" });
    events.getLive.mockResolvedValue(hand);
    service.update.mockRejectedValueOnce(new Error("credit the invoice first"));
    await expect(trackingService.strike("s1", "e1", "Wrong", ACTOR)).rejects.toThrow("credit the invoice first");
    expect(events.softDeleteForCompany).not.toHaveBeenCalled();
  });

  it("refuses what came from another module", async () => {
    events.getLive.mockResolvedValue({ ...hand, kind: "gate_in", source: "warehouse" });
    await expect(trackingService.strike("s1", "e1", "Wrong", ACTOR)).rejects.toThrow("change it there");
  });

  it("asks for a reason", async () => {
    events.getLive.mockResolvedValue(hand);
    await expect(trackingService.strike("s1", "e1", "  ", ACTOR)).rejects.toThrow("Say why");
  });
});

describe("a fact from another module", () => {
  const stamp = (kind: "haulier_confirmed" | "picked_up" | "pod_received") =>
    trackingService.addFact("s1", "c1", "u1", { kind, source: "trucking", occurredAt: new Date("2026-11-05T08:10:00Z"), note: "", externalId: `stamp:${kind}` });

  it("is stored under its own id, on the Prague day, and sets no date", async () => {
    await trackingService.addFact("s1", "c1", "u1", { kind: "pod_received", source: "trucking", occurredAt: new Date("2026-11-05T23:30:00Z"), note: "pod.pdf", externalId: "pod:c1:abc" });
    expect(events.addOnce).toHaveBeenCalledWith(expect.objectContaining({ kind: "pod_received", occurredOn: "2026-11-06", source: "trucking", externalId: "pod:c1:abc", note: "pod.pdf" }));
    expect(service.update).not.toHaveBeenCalled();
  });

  it("keeps Trucking's stamps of its truck only on a Trucking job: a sea import's truck is its delivery", async () => {
    await stamp("haulier_confirmed");
    await stamp("picked_up");
    expect(events.addOnce).not.toHaveBeenCalled();
    await stamp("pod_received");
    expect(events.addOnce).toHaveBeenCalledTimes(1);
    events.addOnce.mockClear();
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, tradeDirection: "Domestic", freightMode: "Road Freight" });
    await stamp("picked_up");
    expect(events.addOnce).toHaveBeenCalledWith(expect.objectContaining({ kind: "picked_up", occurredAt: new Date("2026-11-05T08:10:00Z") }));
  });
});

describe("a master job's houses side by side", () => {
  it("reads every house's paperwork in one go", async () => {
    const houses = [{ ...shipment, id: "h2", jobNumber: "CZ2" }, { ...shipment, id: "h1", jobNumber: "CZ1" }];
    shipments.findByMasterJobId.mockResolvedValue(houses);
    events.latestPerShipment.mockResolvedValue(new Map());
    service.customsStatusesOf.mockResolvedValue(new Map([["h1", CUSTOMS_CLEARED], ["h2", "Paperwork Verified"]]));
    const rows = await trackingService.masterJobHouses("m1", "c1");
    expect(service.customsStatusesOf).toHaveBeenCalledTimes(1);
    expect(service.customsStatusesOf).toHaveBeenCalledWith(houses, "c1");
    expect(service.customsStatusOf).not.toHaveBeenCalled();
    expect(rows.map((r) => [r.jobNumber, r.customsCleared, r.customsStatus])).toEqual([["CZ1", true, CUSTOMS_CLEARED], ["CZ2", false, "Paperwork Verified"]]);
  });
});

describe("a read document", () => {
  const keep = (facts: Parameters<typeof trackingService.keepReading>[2]["facts"], more: Omit<Parameters<typeof trackingService.keepReading>[2], "facts"> = {}) =>
    trackingService.keepReading("s1", ACTOR, { facts, ...more }, NOW);

  it("is kept by the details rule", async () => {
    service.mayChangeDetails.mockResolvedValue(false);
    await expect(keep([{ kind: "arrived", occurredOn: "2026-11-05" }])).rejects.toThrow();
    expect(events.addOnce).not.toHaveBeenCalled();
  });

  it("proposes the ATA and never sets it", async () => {
    await keep([{ kind: "arrived", occurredOn: "2026-11-05", place: "Hamburg" }]);
    expect(service.update).not.toHaveBeenCalled();
    expect(events.addOnce).toHaveBeenCalledWith(expect.objectContaining({ kind: "arrived", source: "document", effect: "proposed", effectField: "actualArrival", effectValue: "2026-11-05", externalId: "document:arrived:2026-11-05:" }));
  });

  it("moves the ETA while there is no ATA, and writes down where the move came from", async () => {
    events.findSameDay.mockResolvedValue({ id: "bare", note: "", place: "", containerNumber: "", occurredAt: null });
    await keep([{ kind: "eta_changed", occurredOn: "2026-12-20", note: "From a document" }]);
    expect(service.update).toHaveBeenCalledWith("s1", "c1", { estimatedArrival: "2026-12-20" }, "u1", "user");
    expect(events.change).toHaveBeenCalledWith("bare", "c1", expect.objectContaining({ source: "document", note: "From a document", effect: "applied" }));
    expect(events.addOnce).not.toHaveBeenCalled();
  });

  it("leaves a date alone once the actual is known", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, actualArrival: "2026-11-04" });
    await keep([{ kind: "eta_changed", occurredOn: "2026-12-20", note: "From a document" }]);
    expect(service.update).not.toHaveBeenCalled();
    expect(events.addOnce).toHaveBeenCalledWith(expect.objectContaining({ effect: "none" }));
  });

  it("refuses everything when one fact can't be kept", async () => {
    await expect(keep([{ kind: "note", occurredOn: "2026-11-05", note: "Fine" }, { kind: "arrived", occurredOn: "2027-01-01" }])).rejects.toThrow("future");
    expect(events.addOnce).not.toHaveBeenCalled();
  });

  it("sets the vessel while nothing has sailed, on the master job when there is one", async () => {
    const vesselChange = { vessel: "EVER TEST", voyage: "123E" };
    await keep([], { vesselChange });
    expect(service.update).toHaveBeenCalledWith("s1", "c1", vesselChange, "u1", "user");
    expect(masterJobs.assertMayChangeEveryHouse).not.toHaveBeenCalled();
    service.update.mockClear();
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, masterJobId: "m1" });
    await keep([], { vesselChange });
    expect(masterJobs.update).toHaveBeenCalledWith("m1", "c1", vesselChange, "u1", EDITOR);
    expect(service.update).not.toHaveBeenCalled();
  });

  it("writes nothing when the master job's houses aren't all the person's, checked before the first write", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, masterJobId: "m1" });
    containers.listByShipmentId.mockResolvedValue([{ id: "a", containerNumber: "CSQU3054383", freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: null }]);
    masterJobs.assertMayChangeEveryHouse.mockRejectedValueOnce(APIError.permissionDenied("CZ2"));
    await expect(keep([{ kind: "note", occurredOn: "2026-11-05", note: "Fine" }, { kind: "eta_changed", occurredOn: "2026-12-20", note: "From a document" }], { lastFreeDay: { day: "2026-11-20", containerIds: ["a"] } })).rejects.toThrow("CZ2");
    expect(masterJobs.assertMayChangeEveryHouse).toHaveBeenCalledWith("m1", "c1", EDITOR);
    expect(containers.setFreeTime).not.toHaveBeenCalled();
    expect(events.addOnce).not.toHaveBeenCalled();
    expect(masterJobs.update).not.toHaveBeenCalled();
  });

  it("refuses a last free day that is no day, on a job with no clock or on another job's box, before writing the vessel", async () => {
    const vesselChange = { vessel: "EVER TEST", voyage: "123E" };
    containers.listByShipmentId.mockResolvedValue([{ id: "a", containerNumber: "CSQU3054383", freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: null }]);
    await expect(keep([], { vesselChange, lastFreeDay: { day: "2026-02-31", containerIds: ["a"] } })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("last free day") });
    await expect(keep([], { vesselChange, lastFreeDay: { day: "2026-11-20", containerIds: ["x"] } })).rejects.toThrow("own containers");
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, freightMode: "Air Freight" });
    await expect(keep([], { vesselChange, lastFreeDay: { day: "2026-11-20", containerIds: ["a"] } })).rejects.toThrow("sea or rail");
    expect(service.update).not.toHaveBeenCalled();
    expect(containers.setFreeTime).not.toHaveBeenCalled();
  });

  it("keeps a hold read again on another day only once: its id has no day", async () => {
    await keep([{ kind: "hold", occurredOn: "2026-11-06", note: "X-ray" }]);
    expect(events.addOnce).toHaveBeenCalledWith(expect.objectContaining({ kind: "hold", externalId: "document:hold:X-ray" }));
  });

  it("leaves the vessel alone once it has sailed", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, actualDeparture: "2026-11-01" });
    await keep([], { vesselChange: { vessel: "EVER TEST", voyage: "123E" } });
    expect(service.update).not.toHaveBeenCalled();
  });

  it("files the document once, by what is in it", async () => {
    await keep([{ kind: "note", occurredOn: "2026-11-05", note: "Fine" }], { file: { fileName: "an.pdf", fileType: "application/pdf", contentBase64: "QUJD" } });
    expect(attachments.addFromModule).toHaveBeenCalledWith("s1", "c1", expect.objectContaining({ fileName: "an.pdf", documentType: "Carrier notice", sourceRef: expect.stringMatching(/^tracking-reading:[0-9a-f]{64}$/) }), "u1");
  });
});

describe("free time", () => {
  const box = (id: string, containerNumber = `BOX${id}`) => ({ id, containerNumber, freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: null, shipmentId: "s1" });
  const input = { containerIds: ["a"], freeTimeDays: 14, freeTimeFrom: "discharge", lastFreeDay: null };
  beforeEach(() => {
    containers.listByShipmentId.mockResolvedValue([box("a"), box("b")]);
    dbTx.transaction.mockImplementation(async (run: (tx: object) => unknown) => run({}));
  });

  it("is set by the details rule, and logged", async () => {
    await trackingService.setFreeTime("s1", ACTOR, input);
    expect(containers.setFreeTime).toHaveBeenCalledWith("s1", "c1", ["a"], { freeTimeDays: 14, freeTimeFrom: "discharge", lastFreeDay: null }, {});
    expect(auditRows.create).toHaveBeenCalledWith(expect.objectContaining({ field: "freeTime", oldValue: "BOXa: none", newValue: "BOXa: 14 d from discharge" }), {});
    service.mayChangeDetails.mockResolvedValue(false);
    await expect(trackingService.setFreeTime("s1", ACTOR, input)).rejects.toThrow();
  });

  it("refuses another job's box, a plane, and nonsense", async () => {
    await expect(trackingService.setFreeTime("s1", ACTOR, { ...input, containerIds: ["x"] })).rejects.toThrow("own containers");
    await expect(trackingService.setFreeTime("s1", ACTOR, { ...input, containerIds: [] })).rejects.toThrow("own containers");
    await expect(trackingService.setFreeTime("s1", ACTOR, { ...input, freeTimeDays: -1 })).rejects.toThrow("Free days");
    await expect(trackingService.setFreeTime("s1", ACTOR, { ...input, freeTimeFrom: "moon" })).rejects.toThrow("counts from");
    await expect(trackingService.setFreeTime("s1", ACTOR, { ...input, lastFreeDay: "soon" })).rejects.toThrow("last free day");
    shipments.getByIdForCompany.mockResolvedValue({ ...shipment, freightMode: "Air Freight" });
    await expect(trackingService.setFreeTime("s1", ACTOR, input)).rejects.toThrow("sea or rail");
    expect(containers.setFreeTime).not.toHaveBeenCalled();
  });

  it("logs nothing when nothing changed", async () => {
    containers.listByShipmentId.mockResolvedValue([{ ...box("a"), freeTimeDays: 14 }]);
    await trackingService.setFreeTime("s1", ACTOR, input);
    expect(auditRows.create).not.toHaveBeenCalled();
  });

  it("tells the warehouse the latest job's date, not an older job's, and nothing once returned", async () => {
    const row = (id: string, shipmentId: string, containerNumber: string, lastFreeDay: string | null) => ({ container: { ...box(id, containerNumber), shipmentId, lastFreeDay }, tradeDirection: "Import", freightMode: "Sea Freight" });
    containers.byNumbers.mockResolvedValue([row("n", "s2", "AAAU1", null), row("o", "s1", "AAAU1", "2026-01-01"), row("r", "s3", "BBBU1", "2026-11-20"), row("k", "s4", "CCCU1", "2026-11-20")]);
    events.ofKinds.mockResolvedValue([{ shipmentId: "s3", kind: "empty_returned", occurredOn: "2026-11-05", containerNumber: "", effect: "none" }]);
    await expect(trackingService.freeTimeByContainer("c1", ["AAAU1", "BBBU1", "CCCU1"], NOW)).resolves.toEqual([{ containerNumber: "CCCU1", lastFreeDay: "2026-11-20" }]);
  });
});
