import { describe, expect, it } from "vitest";
import { buildTracking, CUSTOMS_CLEARED, type TrackingInput } from "../lib/trackingTimeline";
import type { ShipmentRecord } from "../schemas/shipment.schema";
import type { ShipmentAuditRecord } from "../schemas/shipmentAudit.schema";
import type { ShipmentTaskRecord } from "../schemas/shipmentTask.schema";
import type { ShipmentTrackingEventRecord } from "../schemas/shipmentTrackingEvent.schema";

const NOW = new Date("2026-11-06T12:00:00Z");

const shipment = (over: Partial<ShipmentRecord> = {}) =>
  ({
    tradeDirection: "Import",
    freightMode: "Sea Freight",
    department: "Operation Department",
    pol: "Bremerhaven",
    pod: "Charleston",
    destination: "",
    hub: "",
    customsStatus: "",
    customsDeadline: "",
    mrn: "",
    estimatedDeparture: null,
    actualDeparture: null,
    estimatedArrival: null,
    actualArrival: null,
    cargoReadinessDate: null,
    pickupDate: null,
    pickupTime: "",
    etaWarehouse: null,
    warehouseReceivedDate: null,
    warehouseReleasedDate: null,
    plannedDeliveryDate: null,
    plannedDeliveryTime: "",
    actualDeliveryDate: null,
    equipmentDeliveryDate: null,
    equipmentDeliveryTime: "",
    closingDate: null,
    closingTime: "",
    vgmClosing: null,
    vgmClosingTime: "",
    siClosing: null,
    siClosingTime: "",
    ...over,
  }) as ShipmentRecord;

let auditId = 0;
const audit = (field: string, oldValue: string | null, newValue: string | null, at = "2026-11-03T09:12:00Z", userId = "u1") =>
  ({ id: `a${++auditId}`, field, oldValue, newValue, changedAt: new Date(at), userId, shipmentId: "s1", companyId: "c1" }) as ShipmentAuditRecord;

let eventId = 0;
const event = (kind: string, occurredOn: string, over: Partial<ShipmentTrackingEventRecord> = {}) =>
  ({
    id: `e${++eventId}`,
    kind,
    occurredOn,
    occurredAt: null,
    place: "",
    containerNumber: "",
    vessel: "",
    voyage: "",
    source: "user",
    recordedById: "u1",
    note: "",
    effect: "none",
    effectField: "",
    effectValue: null,
    resolvedAt: null,
    createdAt: new Date("2026-11-03T09:12:00Z"),
    ...over,
  }) as ShipmentTrackingEventRecord;

const build = (over: Partial<TrackingInput> = {}) =>
  buildTracking({
    shipment: shipment(),
    customsStatus: over.shipment?.customsStatus ?? "",
    audit: [],
    events: [],
    notices: [],
    mayChangeDetails: true,
    tasks: [],
    names: new Map([["u1", "jana@firma.cz"]]),
    invoiced: false,
    changesCapped: false,
    now: NOW,
    ...over,
  });

const row = (t: ReturnType<typeof build>, key: string) => t.milestones.find((m) => m.key === key);

describe("the milestones", () => {
  it("draws the planned dates of a job with no actual date, the first open step marked", () => {
    const t = build({ shipment: shipment({ estimatedDeparture: "2026-11-20", estimatedArrival: "2026-12-10" }) });
    expect(t.milestones.map((m) => m.key)).toEqual(["departed", "arrived", "customs", "delivered"]);
    expect(row(t, "departed")).toMatchObject({ state: "next", planned: "2026-11-20", actual: null, place: "Bremerhaven", lateDays: 0 });
    expect(row(t, "arrived")).toMatchObject({ state: "open", planned: "2026-12-10", taxDate: true });
  });

  it("marks an actual date done and says who recorded it", () => {
    const t = build({
      shipment: shipment({ estimatedDeparture: "2026-09-19", actualDeparture: "2026-09-20" }),
      audit: [audit("actualDeparture", null, "2026-09-20", "2026-09-21T08:00:00Z")],
    });
    expect(row(t, "departed")).toMatchObject({
      state: "done",
      actual: "2026-09-20",
      recorded: { at: "2026-09-21T08:00:00.000Z", by: "jana@firma.cz", source: "" },
    });
  });

  it("names no person for a system write or a user who left", () => {
    const t = build({
      shipment: shipment({ actualDeliveryDate: "2026-10-22" }),
      audit: [audit("actualDeliveryDate", null, "2026-10-22", "2026-10-22T10:00:00Z", "service")],
    });
    expect(row(t, "delivered")?.recorded).toMatchObject({ by: "", source: "Trucking" });
  });

  it("leaves out an optional row holding nothing and shows it once it has a date", () => {
    expect(row(build(), "gateIn")).toBeUndefined();
    expect(row(build({ shipment: shipment({ etaWarehouse: "2026-11-20" }) }), "gateIn")).toMatchObject({ planned: "2026-11-20" });
  });

  it("keeps a date we only plan by out of the steps to happen", () => {
    const t = build({ shipment: shipment({ cargoReadinessDate: "2026-09-15", estimatedDeparture: "2026-11-20" }) });
    expect(row(t, "cargoReady")).toMatchObject({ state: "planned", lateDays: 0 });
    expect(row(t, "departed")?.state).toBe("next");
  });

  it("is late once the planned date has passed with nothing recorded", () => {
    const t = build({ shipment: shipment({ estimatedArrival: "2026-11-02" }) });
    expect(row(t, "arrived")).toMatchObject({ state: "late", lateDays: 4 });
  });

  it("is not late on the planned day itself", () => {
    const t = build({ shipment: shipment({ estimatedArrival: "2026-11-06" }) });
    expect(row(t, "arrived")?.lateDays).toBe(0);
  });

  it("doesn't call an earlier date late once a later step happened, unless it is the tax date", () => {
    const t = build({
      shipment: shipment({ estimatedDeparture: "2026-10-01", estimatedArrival: "2026-10-20", warehouseReceivedDate: "2026-10-25" }),
    });
    expect(row(t, "departed")).toMatchObject({ state: "open", lateDays: 0 });
    expect(row(t, "arrived")).toMatchObject({ state: "late", lateDays: 17, taxDate: true });
  });

  it("shows the planned date's time when it has one", () => {
    const t = build({ shipment: shipment({ pickupDate: "2026-11-10", pickupTime: "07:30" }) });
    expect(row(t, "pickup")).toMatchObject({ planned: "2026-11-10", plannedTime: "07:30" });
  });
});

describe("by direction and mode", () => {
  it("puts an export's customs and closings before it sails, the departure its tax date", () => {
    const t = build({
      shipment: shipment({ tradeDirection: "Export", closingDate: "2026-11-10", estimatedDeparture: "2026-11-14" }),
    });
    expect(t.milestones.map((m) => m.key)).toEqual(["customs", "closing", "departed", "arrived"]);
    expect(row(t, "customs")?.leg).toBe("origin");
    expect(row(t, "departed")?.taxDate).toBe(true);
    expect(row(t, "arrived")?.taxDate).toBe(false);
  });

  it("gives a road job its pick-up and delivery, dated by the delivery", () => {
    const t = build({ shipment: shipment({ freightMode: "Road Freight", department: "Road Department" }) });
    expect(t.milestones.map((m) => m.key)).toEqual(["pickup", "delivered"]);
    expect(row(t, "delivered")?.taxDate).toBe(true);
  });

  it("shows a Trucking job no customs row for waiting paperwork alone, only once there is something to say", () => {
    const road = { freightMode: "Road Freight", department: "Road Department" };
    expect(row(build({ shipment: shipment(road), customsStatus: "Waiting For Commercial Paperwork" }), "customs")).toBeUndefined();
    expect(row(build({ shipment: shipment({ ...road, mrn: "26CZ1" }), customsStatus: "Waiting For Commercial Paperwork" }), "customs")).toBeDefined();
    expect(row(build({ shipment: shipment(road), customsStatus: CUSTOMS_CLEARED }), "customs")?.state).toBe("done");
  });

  it("gives an international Road Freight import its departure, arrival and customs, dated by the ATA", () => {
    const t = build({ shipment: shipment({ freightMode: "Road Freight" }), customsStatus: "Waiting For Commercial Paperwork" });
    expect(t.milestones.map((m) => m.key)).toEqual(expect.arrayContaining(["departed", "arrived", "customs", "delivered"]));
    expect(row(t, "arrived")?.taxDate).toBe(true);
    expect(row(t, "pickup")).toBeUndefined();
  });
});

describe("customs", () => {
  it("is done when cleared, on the day it was recorded", () => {
    const t = build({
      shipment: shipment({ customsStatus: CUSTOMS_CLEARED, mrn: "26CZ123" }),
      audit: [audit("customsStatus", "Paperwork Verified", CUSTOMS_CLEARED, "2026-11-04T23:30:00Z")],
    });
    // 23:30 UTC is already the next day in Prague.
    expect(row(t, "customs")).toMatchObject({ state: "done", actual: "2026-11-05", detail: "MRN 26CZ123", recorded: { source: "Customs" } });
  });

  it("goes by the status the shipment shows, not the stored one", () => {
    const t = build({ shipment: shipment({ customsStatus: CUSTOMS_CLEARED }), customsStatus: "Paperwork Verification Pending" });
    expect(row(t, "customs")).toMatchObject({ actual: null, detail: "Paperwork Verification Pending", recorded: null });
    expect(row(t, "customs")?.state).not.toBe("done");
  });

  it("names nobody for the paperwork's own steps", () => {
    const t = build({ customsStatus: "Waiting For Commercial Paperwork", audit: [audit("customsStatus", "", "Under Customs Clearance")] });
    expect(row(t, "customs")?.recorded).toBeNull();
  });

  it("says where it stands until then", () => {
    const t = build({ shipment: shipment({ customsStatus: "Paperwork Verified" }), audit: [audit("customsStatus", "", "Paperwork Verified")] });
    expect(row(t, "customs")).toMatchObject({ actual: null, detail: "Paperwork Verified" });
    expect(row(t, "customs")?.state).not.toBe("done");
  });

  it("takes an Urgent shipment's deadline as its planned date", () => {
    const t = build({ shipment: shipment({ customsStatus: "Paperwork Verified", customsDeadline: "2026-11-10 14:00" }) });
    expect(row(t, "customs")).toMatchObject({ planned: "2026-11-10", plannedTime: "14:00" });
  });
});

describe("moved dates", () => {
  const moved = audit("estimatedArrival", "2026-12-09", "2026-12-16");

  it("shows what the planned date was before its last change", () => {
    const t = build({ shipment: shipment({ estimatedArrival: "2026-12-16" }), audit: [moved] });
    expect(row(t, "arrived")).toMatchObject({ planned: "2026-12-16", wasPlanned: "2026-12-09", movedDays: 7 });
  });

  it("calls the first filling-in no move", () => {
    const t = build({ shipment: shipment({ estimatedArrival: "2026-12-16" }), audit: [audit("estimatedArrival", null, "2026-12-16")] });
    expect(row(t, "arrived")).toMatchObject({ wasPlanned: null, movedDays: null });
  });

  it("asks for attention within the window, and not after it", () => {
    const recent = build({ shipment: shipment({ estimatedArrival: "2026-12-16" }), audit: [moved] });
    expect(recent.attention).toEqual([
      { kind: "moved", eventId: null, note: "", milestoneKey: "arrived", what: "ETA", days: 7, from: "2026-12-09", to: "2026-12-16", at: "2026-11-03T09:12:00.000Z", by: "jana@firma.cz" },
    ]);
    const old = build({
      shipment: shipment({ estimatedArrival: "2026-12-16" }),
      audit: [audit("estimatedArrival", "2026-12-09", "2026-12-16", "2026-10-20T09:00:00Z")],
    });
    expect(old.attention).toEqual([]);
  });

  it("no longer matters once the step happened", () => {
    const t = build({ shipment: shipment({ estimatedArrival: "2026-10-16", actualArrival: "2026-10-16" }), audit: [moved] });
    expect(t.attention).toEqual([]);
  });
});

describe("late, as attention", () => {
  it("asks from 2 days after the ETA with no ATA", () => {
    expect(build({ shipment: shipment({ estimatedArrival: "2026-11-05" }) }).attention).toEqual([]);
    expect(build({ shipment: shipment({ estimatedArrival: "2026-11-04" }) }).attention).toEqual([
      { kind: "late", eventId: null, note: "", milestoneKey: "arrived", what: "ETA", days: 2, from: null, to: "2026-11-04", at: null, by: "" },
    ]);
  });

  it("asks about a missing ATD for an export only", () => {
    const etd = { estimatedDeparture: "2026-11-01" };
    expect(build({ shipment: shipment(etd) }).attention).toEqual([]);
    expect(build({ shipment: shipment({ ...etd, tradeDirection: "Export" }) }).attention.map((a) => a.what)).toEqual(["ETD"]);
  });
});

describe("the changes", () => {
  it("lists dates and routing, newest first, and leaves customs out", () => {
    const t = build({
      audit: [
        audit("estimatedArrival", "2026-12-09", "2026-12-16"),
        audit("vessel", "", "MSC ANNA"),
        audit("customsStatus", "", "Paperwork Verified"),
      ],
    });
    expect(t.changes.map((c) => c.label)).toEqual(["ETA", "Vessel"]);
    expect(t.changes[0]).toMatchObject({ isDate: true, oldValue: "2026-12-09", newValue: "2026-12-16", movedDays: 7, by: "jana@firma.cz" });
    expect(t.changes[1]).toMatchObject({ isDate: false, oldValue: null, newValue: "MSC ANNA", movedDays: null });
  });
});

describe("the ticks", () => {
  it("keeps only what was ticked, with who", () => {
    const task = (over: Partial<ShipmentTaskRecord>) => ({ taskKey: "imp_billed", completed: true, completedAt: new Date("2026-11-01T10:00:00Z"), completedById: "u1", ...over }) as ShipmentTaskRecord;
    const t = build({ tasks: [task({}), task({ taskKey: "imp_delivered", completed: false, completedAt: null })] });
    expect(t.ticks).toEqual([{ taskKey: "imp_billed", completedAt: "2026-11-01T10:00:00.000Z", by: "jana@firma.cz" }]);
  });

  it("moves no milestone", () => {
    const task = { taskKey: "imp_delivered", completed: true, completedAt: new Date("2026-11-01T10:00:00Z"), completedById: "u1" } as ShipmentTaskRecord;
    expect(row(build({ tasks: [task] }), "delivered")?.state).not.toBe("done");
  });
});

describe("the tax date", () => {
  it("is the ATA of an import, provisional by the ETA until then", () => {
    expect(build({ shipment: shipment({ estimatedArrival: "2026-12-09" }) }).taxDate).toMatchObject({ basis: "eta", date: "2026-12-09", actual: false });
    const t = build({
      shipment: shipment({ estimatedArrival: "2026-12-09", actualArrival: "2026-12-10" }),
      audit: [audit("actualArrival", null, "2026-12-10")],
      invoiced: true,
    });
    expect(t.taxDate).toMatchObject({ basis: "ata", date: "2026-12-10", actual: true, invoiced: true, recorded: { by: "jana@firma.cz" } });
  });

  it("is the ATD of an export", () => {
    const t = build({ shipment: shipment({ tradeDirection: "Export", estimatedDeparture: "2026-11-20" }) });
    expect(t.taxDate).toMatchObject({ basis: "etd", date: "2026-11-20", actual: false });
  });

  it("is the delivery of a job dated by its delivery", () => {
    const road = { department: "Road Department", estimatedArrival: "2026-12-09" };
    expect(build({ shipment: shipment({ ...road, plannedDeliveryDate: "2026-11-20" }) }).taxDate).toMatchObject({ basis: "plannedDelivery", date: "2026-11-20" });
    expect(build({ shipment: shipment({ ...road, actualDeliveryDate: "2026-11-21" }) }).taxDate).toMatchObject({ basis: "delivery", date: "2026-11-21", actual: true });
  });

  it("is none until any date says", () => {
    expect(build({ invoiced: null }).taxDate).toEqual({ basis: "none", date: null, actual: false, recorded: null, invoiced: null });
  });
});

describe("recorded events on the timeline", () => {
  it("makes a row with no date of its own done, and shows it only then", () => {
    expect(row(build(), "loaded")).toBeUndefined();
    const t = build({ events: [event("loaded", "2026-09-19", { occurredAt: new Date("2026-09-19T12:30:00Z"), place: "Bremerhaven" })] });
    expect(row(t, "loaded")).toMatchObject({ state: "done", actual: "2026-09-19", actualTime: "14:30", place: "Bremerhaven", recorded: { by: "jana@firma.cz" } });
  });

  it("gives a planned-only row its actual date", () => {
    const t = build({ shipment: shipment({ cargoReadinessDate: "2026-09-15" }), events: [event("cargo_ready", "2026-09-16")] });
    expect(row(t, "cargoReady")).toMatchObject({ state: "done", planned: "2026-09-15", actual: "2026-09-16" });
  });

  it("keeps the shipment's date as the truth: an event of another day adds nothing", () => {
    const t = build({ shipment: shipment({ actualArrival: "2026-10-16" }), events: [event("arrived", "2026-10-14", { place: "Old" })] });
    expect(row(t, "arrived")).toMatchObject({ actual: "2026-10-16", actualTime: "" });
  });

  it("takes the hour and who from the event of that day", () => {
    const t = build({
      shipment: shipment({ actualArrival: "2026-10-16" }),
      events: [event("arrived", "2026-10-16", { occurredAt: new Date("2026-10-16T12:30:00Z"), source: "master_job" })],
    });
    expect(row(t, "arrived")).toMatchObject({ actualTime: "14:30", recorded: { source: "Master job", by: "jana@firma.cz" } });
  });

  it("lists every transhipment as its own row after the departure, in order", () => {
    const t = build({
      shipment: shipment({ estimatedDeparture: "2026-09-19" }),
      events: [event("ts_departed", "2026-10-02", { place: "Singapore" }), event("ts_arrived", "2026-09-30", { place: "Singapore" })],
    });
    const keys = t.milestones.map((m) => m.label);
    expect(keys.indexOf("Transhipment: arrived")).toBe(keys.indexOf("Departed") + 1);
    expect(keys.indexOf("Transhipment: departed")).toBe(keys.indexOf("Departed") + 2);
  });

  it("doesn't take a proposed date for a fact: it waits on its row", () => {
    const proposal = event("arrived", "2026-10-16", { effect: "proposed", effectField: "actualArrival", effectValue: "2026-10-16", source: "carrier" });
    const t = build({ shipment: shipment({ estimatedArrival: "2026-12-16" }), events: [proposal] });
    expect(row(t, "arrived")).toMatchObject({ actual: null, proposed: { eventId: proposal.id, day: "2026-10-16", source: "Carrier" } });
    expect(row(t, "arrived")?.state).not.toBe("done");
  });

  it("doesn't take a dismissed date for a fact either", () => {
    const t = build({ events: [event("loaded", "2026-09-19", { effect: "dismissed" })] });
    expect(row(t, "loaded")).toBeUndefined();
  });

  it("marks customs cleared with the day and the hour of its event", () => {
    const t = build({ customsStatus: CUSTOMS_CLEARED, events: [event("customs_released", "2026-11-04", { occurredAt: new Date("2026-11-04T13:05:00Z") })] });
    expect(row(t, "customs")).toMatchObject({ state: "done", actual: "2026-11-04", actualTime: "14:05" });
  });
});

describe("the events list", () => {
  it("leaves out a plan change the changes card already says, unless it has a reason", () => {
    const t = build({ events: [event("eta_changed", "2026-11-20"), event("eta_changed", "2026-11-25", { note: "Vessel rolled" }), event("gate_in", "2026-11-01", { source: "warehouse" })] });
    expect(t.events.map((e) => [e.kind, e.note])).toEqual([["eta_changed", "Vessel rolled"], ["gate_in", ""]]);
  });

  it("lets only what a person recorded be struck", () => {
    const t = build({ events: [event("loaded", "2026-11-01"), event("gate_in", "2026-11-01", { source: "warehouse" })] });
    expect(t.events.map((e) => [e.source, e.strikeable])).toEqual([["", true], ["Warehouse", false]]);
  });
});

describe("reported exceptions", () => {
  it("ask for attention with their reason, until closed", () => {
    const open = event("rolled", "2026-11-03", { note: "No space" });
    const closed = event("delayed", "2026-11-01", { note: "Storm", resolvedAt: new Date() });
    expect(build({ events: [open, closed] }).attention).toEqual([
      { kind: "exception", eventId: open.id, note: "No space", milestoneKey: "rolled", what: "Rolled", days: 0, from: null, to: "2026-11-03", at: "2026-11-03T09:12:00.000Z", by: "jana@firma.cz" },
    ]);
  });
});

describe("what can be recorded", () => {
  it("is everything for who may change the details, customs' own kinds for everyone else", () => {
    expect(build().recordable.map((k) => k.kind)).toContain("arrived");
    expect(build({ mayChangeDetails: false }).recordable.map((k) => k.kind)).toEqual(["customs_released", "hold"]);
  });

  it("is nothing on a Trucking job, and as on any job on an international Road Freight one", () => {
    expect(build({ shipment: shipment({ freightMode: "Road Freight", department: "Road Department" }) }).recordable).toEqual([]);
    expect(build({ shipment: shipment({ tradeDirection: "Domestic" }) }).recordable).toEqual([]);
    expect(build({ shipment: shipment({ freightMode: "Road Freight" }) }).recordable.map((k) => k.kind)).toContain("arrived");
  });
});

describe("what the customer was told", () => {
  const notice = (over: Record<string, unknown> = {}) =>
    ({ id: "n1", kind: "status", channel: "email", toldTo: "jana@alza.cz", subject: "", note: "", etaPod: "2026-12-09", etaWarehouse: null, plannedDelivery: null, toldById: "u1", createdAt: new Date("2026-11-01T10:00:00Z"), ...over }) as never;

  it("is listed with who told them", () => {
    const t = build({ notices: [notice()] });
    expect(t.customerNotices).toMatchObject([{ id: "n1", label: "Status update", toldTo: "jana@alza.cz", etaPod: "2026-12-09", by: "jana@firma.cz" }]);
  });

  it("asks for attention when a date told has moved, going by the latest notice only", () => {
    const moved = build({ shipment: shipment({ estimatedArrival: "2026-12-16" }), notices: [notice()] });
    expect(moved.attention).toMatchObject([{ kind: "not_told", what: "ETA", from: "2026-12-09", to: "2026-12-16", milestoneKey: "estimatedArrival" }]);
    const toldAgain = build({ shipment: shipment({ estimatedArrival: "2026-12-16" }), notices: [notice({ id: "n2", etaPod: "2026-12-16" }), notice()] });
    expect(toldAgain.attention).toEqual([]);
  });
});

describe("what Trucking hands over", () => {
  it("shows the delivery advice and the POD on their rows, with what there is to say", () => {
    const t = build({
      events: [
        event("pod_received", "2026-11-05", { source: "trucking", note: "pod.pdf", occurredAt: new Date("2026-11-05T09:00:00Z") }),
        event("delivery_advised", "2026-11-03", { source: "trucking", note: "By phone to Jan" }),
      ],
    });
    expect(row(t, "pod")).toMatchObject({ state: "done", actual: "2026-11-05", actualTime: "10:00", detail: "pod.pdf", recorded: { source: "Trucking" } });
    expect(row(t, "advised")).toMatchObject({ state: "done", detail: "By phone to Jan" });
    const keys = t.milestones.map((m) => m.key);
    expect(keys.indexOf("advised")).toBeLessThan(keys.indexOf("delivered"));
    expect(keys.indexOf("pod")).toBeGreaterThan(keys.indexOf("delivered"));
  });
});
