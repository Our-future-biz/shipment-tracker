import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ managersCockpitRows: vi.fn(), dateMovedLately: vi.fn(), trackingAttentionCandidates: vi.fn() }));
const events = vi.hoisted(() => ({ proposedOn: vi.fn(), latestPerShipment: vi.fn(), arrivedAtHub: vi.fn(), ofKinds: vi.fn() }));
const notices = vi.hoisted(() => ({ latestPerShipment: vi.fn() }));
const containers = vi.hoisted(() => ({ withFreeTime: vi.fn(), listByShipmentIds: vi.fn() }));
const users = vi.hoisted(() => ({ userEmails: vi.fn() }));
const holidays = vi.hoisted(() => ({ _internalHolidaysCzNational: vi.fn() }));
const extra = vi.hoisted(() => ({ extraSignals: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ holidays }));
// The other tables' reads have their own test (tests/services/managersCockpitExtra.service.test.ts): here only how their answer is wired in.
vi.mock("../../services/managersCockpitExtra.service", () => extra);
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: events }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: notices }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: containers }));
vi.mock("../../lib/userEmails", () => users);

import { COCKPIT_JOB_LIMIT } from "../../lib/cockpitThresholds";
import { NOT_KNOWN, managersCockpitService } from "../../services/managersCockpit.service";
import { trackingAttentionService } from "../../services/trackingAttention.service";

// The reads of Shipments → Managers, against stand-ins for the repositories: how many jobs it
// asks for, that every side read gets the jobs it kept, and what it says when a read fails. The
// rules themselves are tests/managersCockpit.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// Wednesday 18 Nov 2026, 00:30 in Prague - still the 17th in UTC.
const NOW = new Date("2026-11-17T23:30:00Z");
const EVERYONE = { mode: "all", direction: "all", handledBy: null } as const;

const row = (n: number, over = {}) => ({
  id: `id-${n}`,
  jobNumber: `CZFCL${String(n).padStart(8, "0")}`,
  customer: "ACME s.r.o.",
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "Operation Department",
  status: "Booked [IMP]",
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
  etaWarehouse: null,
  warehouseReceivedDate: null,
  plannedDeliveryDate: null,
  actualDeliveryDate: null,
  personInCharge: "jan@firma.cz",
  holidayCover: "",
  closingDate: null,
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
  customsPriority: "Standard",
  customsStatus: "",
  customsDeadline: "",
  bookingConfirmation: "Received",
  claim: "No",
  cargoReadinessDate: null,
  pickupDate: null,
  closingTime: "",
  masterBolNumber: "",
  masterBolType: "",
  houseBolType: "",
  houseBolRelease: "",
  bolDraft: "Approved",
  plateNumber: "",
  creditCheck: "Green",
  dangerous: "No",
  loadType: "Consolidation",
  masterJobId: null,
  customsProcedure: "",
  customsOffice: "",
  mrn: "",
  warehouseReleasedDate: null,
  createdAt: new Date("2026-11-01T08:00:00Z"),
  updatedAt: new Date("2026-11-01T08:00:00Z"),
  arrivalNoticeSent: true,
  ...over,
});
const NO_EXTRA = { byJob: new Map(), masterJobRows: [], notKnown: [] };
const TIMELINE_KINDS = ["picked_up", "loaded", "gate_in", "haulier_confirmed", "pod_received", "rolled", "hold"];
const CLOCK_KINDS = ["discharged", "terminal_out", "empty_returned"];
/** The one read of the jobs' events: the clocks' kinds and the timeline's together. */
const ALL_KINDS = [...CLOCK_KINDS, ...TIMELINE_KINDS];
const event = (shipmentId: string, kind: string, occurredOn: string, over = {}) => ({ shipmentId, kind, occurredOn, effect: "none", resolvedAt: null, containerNumber: "", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  shipments.managersCockpitRows.mockResolvedValue([]);
  shipments.dateMovedLately.mockResolvedValue([]);
  events.proposedOn.mockResolvedValue([]);
  events.latestPerShipment.mockResolvedValue(new Map());
  events.arrivedAtHub.mockResolvedValue(new Set());
  events.ofKinds.mockResolvedValue([]);
  notices.latestPerShipment.mockResolvedValue(new Map());
  containers.withFreeTime.mockResolvedValue([]);
  containers.listByShipmentIds.mockResolvedValue([]);
  users.userEmails.mockResolvedValue(new Map([["u1", " Jan@Firma.cz "]]));
  holidays._internalHolidaysCzNational.mockResolvedValue({ dates: [] });
  extra.extraSignals.mockResolvedValue(NO_EXTRA);
});

describe("Shipments → Managers' reads", () => {
  it("asks for one job more than it counts, and says capped only when there was one", async () => {
    shipments.managersCockpitRows.mockResolvedValue(Array.from({ length: COCKPIT_JOB_LIMIT }, (_, i) => row(i)));
    const all = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(shipments.managersCockpitRows).toHaveBeenCalledWith(COMPANY, COCKPIT_JOB_LIMIT + 1);
    expect(all).toMatchObject({ capped: false, tiles: { active: COCKPIT_JOB_LIMIT } });

    shipments.managersCockpitRows.mockResolvedValue(Array.from({ length: COCKPIT_JOB_LIMIT + 1 }, (_, i) => row(i)));
    const cut = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(cut).toMatchObject({ capped: true, tiles: { active: COCKPIT_JOB_LIMIT } });
    // The job left out is asked about nowhere.
    const kept = Array.from({ length: COCKPIT_JOB_LIMIT }, (_, i) => `id-${i}`);
    expect(shipments.dateMovedLately).toHaveBeenLastCalledWith(COMPANY, kept);
    for (const read of [events.proposedOn, events.latestPerShipment, events.arrivedAtHub, notices.latestPerShipment, containers.withFreeTime]) expect(read).toHaveBeenLastCalledWith(kept, COMPANY);
    // The events are read once per answer, for the boxes' free time clocks and the timeline's facts together.
    expect(events.ofKinds).toHaveBeenCalledTimes(2);
    expect(events.ofKinds).toHaveBeenLastCalledWith(kept, COMPANY, ALL_KINDS);
    expect(extra.extraSignals.mock.lastCall![0].map((j: { id: string }) => j.id)).toEqual(kept);
  });

  it("judges everything on the one Prague day of `now`: the cut-offs and the boxes' free time alike", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-19" }), row(2)]);
    // A box whose last free day was the 17th: over by one day on the 18th, not over on the 17th.
    containers.withFreeTime.mockResolvedValue([{ shipmentId: "id-2", containerNumber: "AAAU1", freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: "2026-11-17" }]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.today).toBe("2026-11-18");
    expect(c.asOf).toBe("2026-11-17T23:30:00.000Z");
    expect(c.urgent.rows.map((r) => [r.kind, r.jobNumber, r.tags])).toEqual([
      ["job", "CZFCL00000001", [{ text: "Closing tomorrow", urgent: true, kind: "cutoff" }]],
      ["job", "CZFCL00000002", [{ text: "Free time over · AAAU1 1 d over", urgent: true, kind: "free_time" }]],
    ]);
    expect(c.tiles).toMatchObject({ cutoffsDue: 1, freeTime: 1, signals: { cutoff: 1, free_time: 1, owner: 0 } });
    expect(c).toMatchObject({ holidaysKnown: true, notKnown: [] });
  });

  it("reads the company's holidays once, around the one day, and hands them to every working-day count", async () => {
    // Wednesday the 18th: Thursday is the next working day - unless the company is off then.
    shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-20" })]);
    const plain = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(plain.attention.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Closing on Fri 20.11."]]);
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledTimes(1);
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledWith({ from: "2026-10-04", to: "2027-01-02" }, { authData: { userID: "", companyID: COMPANY, role: "user" } });

    holidays._internalHolidaysCzNational.mockResolvedValue({ dates: ["2026-11-19"] });
    const dayOff = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(dayOff.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Closing on Fri 20.11."]]);
    expect(dayOff.holidaysKnown).toBe(true);
    // The same days off reach the other tables' rules.
    expect(extra.extraSignals.mock.lastCall![1]).toEqual({ companyId: COMPANY, now: NOW, today: "2026-11-18", holidays: ["2026-11-19"] });
  });

  it("says so when the holidays could not be read, and still answers: weekends and the public holidays only", async () => {
    holidays._internalHolidaysCzNational.mockRejectedValue(new Error("the holidays service is down"));
    shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-19" })]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.holidaysKnown).toBe(false);
    expect(c.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Closing tomorrow"]]);
    expect(extra.extraSignals.mock.lastCall![1].holidays).toEqual([]);
    // A missing holiday calendar is said by its own field, not among the parts not known.
    expect(c.notKnown).toEqual([]);
  });

  it("reads each job's timeline: a missed Closing stays until a picked-up fact, a hold is open until it was closed", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-17" }), row(2, { closingDate: "2026-11-17" }), row(3), row(4)]);
    events.ofKinds.mockResolvedValue([
      event("id-2", "picked_up", "2026-11-16"),
      event("id-3", "hold", "2026-11-16"),
      // Closed by the customs release that followed it.
      event("id-4", "hold", "2026-11-12", { resolvedAt: new Date("2026-11-14T09:00:00Z") }),
      // A proposal is no fact.
      event("id-1", "loaded", "2026-11-16", { effect: "proposed" }),
    ]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.urgent.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([
      ["CZFCL00000003", ["Customs hold · 2 days, since 16.11."]],
      ["CZFCL00000001", ["Closing missed · 17.11."]],
    ]);
    expect(c.notKnown).toEqual([]);
  });

  it("splits the one read of the events in memory: the boxes' clocks get theirs, the timeline its own", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-17" }), row(2)]);
    // A box with 3 free days from its discharge on the 13th: the last free day was the 16th.
    containers.withFreeTime.mockResolvedValue([{ shipmentId: "id-2", containerNumber: "AAAU1", freeTimeDays: 3, freeTimeFrom: "discharge", lastFreeDay: null }]);
    events.ofKinds.mockResolvedValue([event("id-2", "discharged", "2026-11-13"), event("id-1", "gate_in", "2026-11-16")]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(events.ofKinds).toHaveBeenCalledTimes(1);
    expect(events.ofKinds).toHaveBeenCalledWith(["id-1", "id-2"], COMPANY, ALL_KINDS);
    // The gate-in cleared job 1's missed Closing; the discharge started job 2's clock.
    expect(c.urgent.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([["CZFCL00000002", ["Free time over · AAAU1 2 d over"]]]);
  });

  it("names the timeline as not known when the events could not be read: the clocks are asked for again by themselves, a Closing still ahead shows, a missed one is withheld", async () => {
    shipments.managersCockpitRows.mockResolvedValue([
      row(1, { closingDate: "2026-11-17", vgmClosing: "2026-11-18", vgm: "Pending (Red)" }),
      row(2, { closingDate: "2026-11-19" }),
      row(3),
    ]);
    containers.withFreeTime.mockResolvedValue([{ shipmentId: "id-3", containerNumber: "AAAU1", freeTimeDays: 3, freeTimeFrom: "discharge", lastFreeDay: null }]);
    events.ofKinds.mockImplementation(async (_ids: string[], _company: string, kinds: string[]) => {
      if (kinds.includes("hold")) throw new Error("the events could not be read");
      return [event("id-3", "discharged", "2026-11-13")];
    });
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(events.ofKinds.mock.calls.map((call) => call[2])).toEqual([ALL_KINDS, CLOCK_KINDS]);
    expect(c.notKnown).toEqual([NOT_KNOWN.timeline]);
    expect(c.urgent.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([
      ["CZFCL00000001", ["VGM closing today"]],
      ["CZFCL00000002", ["Closing tomorrow"]],
      ["CZFCL00000003", ["Free time over · AAAU1 2 d over"]],
    ]);
  });

  it("fails when the events can be read neither way: the boxes' clocks are part of the answer itself", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1)]);
    events.ofKinds.mockRejectedValue(new Error("the events could not be read"));
    await expect(managersCockpitService.cockpit(COMPANY, EVERYONE, NOW)).rejects.toThrow("the events could not be read");
  });

  it("reads the containers of the arriving Full Load imports only, and names them as not known when that fails", async () => {
    const fcl = { loadType: "Full Load", estimatedArrival: "2026-11-20" };
    shipments.managersCockpitRows.mockResolvedValue([row(1, fcl), row(2), row(3, { ...fcl, tradeDirection: "Export" }), row(4, { ...fcl, estimatedArrival: "2026-12-20" })]);
    containers.listByShipmentIds.mockResolvedValue([{ shipmentId: "id-1", containerNumber: "MSKU1234567", freeTimeDays: null, lastFreeDay: null }]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(containers.listByShipmentIds).toHaveBeenCalledWith(["id-1"], COMPANY);
    expect(c.attention.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([["CZFCL00000001", ["No free time typed · MSKU1234567 · ETA 20.11."]]]);

    containers.listByShipmentIds.mockRejectedValue(new Error("containers could not be read"));
    const failed = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(failed.notKnown).toEqual([NOT_KNOWN.boxes]);
    expect(failed.attention.total).toBe(0);
  });

  it("merges the other tables' signals into each job's row, adds the Master Jobs with no house, and passes on what they could not read", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-19" }), row(2)]);
    extra.extraSignals.mockResolvedValue({
      byJob: new Map([["id-1", [{ rank: 3, urgent: true, kind: "paperwork", area: "customs", text: "Waiting For Commercial Paperwork · arrived 17.11." }]]]),
      masterJobRows: [{ id: "mj-1", number: "MCZ2026001", customer: "Gamma GmbH", signals: [{ rank: 36, urgent: false, kind: "master_job", area: "details", text: "No shipment linked · ETD in 6 days" }], freightMode: "Sea Freight", tradeDirection: "Export", handledBy: "eva@firma.cz", holidayCover: "" }],
      notKnown: ["remeasurements"],
    });
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.urgent.rows.map((r) => [r.jobNumber, r.area, r.tags.map((t) => t.text)])).toEqual([["CZFCL00000001", "customs", ["Waiting For Commercial Paperwork · arrived 17.11.", "Closing tomorrow"]]]);
    expect(c.attention.rows).toEqual([expect.objectContaining({ kind: "masterJob", id: "mj-1", jobNumber: "MCZ2026001", customer: "Gamma GmbH", mode: "sea", handledBy: "eva@firma.cz" })]);
    expect(c.tiles).toMatchObject({ active: 2, signals: { paperwork: 1, master_job: 1, cutoff: 1 } });
    expect(c.notKnown).toEqual(["remeasurements"]);
    // The Master Job obeys the filters by its own fields.
    expect((await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, direction: "import" }, NOW)).attention.total).toBe(0);
    expect((await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, handledBy: "eva@firma.cz" }, NOW)).attention.total).toBe(1);
  });

  it("answers without the other tables when their read fails altogether: no signal of theirs, and it says which", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-19" })]);
    extra.extraSignals.mockRejectedValue(new Error("boom"));
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    // Everything that module reads is gone, and is named.
    expect(c.notKnown).toEqual(["documents, customs, requests, Import Instructions, remeasurements and Master Jobs"]);
    expect(c.notKnown).toEqual([NOT_KNOWN.extra]);
    expect(c.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Closing tomorrow"]]);
    expect(c.attention.total).toBe(0);
  });

  it("gives each job its own facts: a date to confirm, the jobs whose ETD or ETA moved", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1), row(2), row(3)]);
    events.proposedOn.mockResolvedValue([{ shipmentId: "id-2", kind: "arrived", source: "carrier", effectValue: "2026-11-17", occurredOn: "2026-11-17" }]);
    shipments.dateMovedLately.mockResolvedValue(["id-1", "id-3"]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.urgent.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000002"]);
    expect(c.tiles.etdEtaMoved).toBe(2);
  });

  it("hands the filters on", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1), row(2, { freightMode: "Air Freight", personInCharge: "" })]);
    const c = await managersCockpitService.cockpit(COMPANY, { mode: "air", direction: "import", handledBy: "nobody" }, NOW);
    expect(c).toMatchObject({ mode: "air", direction: "import", handledBy: "nobody", tiles: { active: 1, noHandledBy: 1 } });
  });

  it("knows the users by e-mail, trimmed and in any case", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1), row(2, { personInCharge: "left@firma.cz" })]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.tiles.handledByNotUser).toBe(1);
    expect(c.people).toEqual([
      { handledBy: "jan@firma.cz", isUser: true, active: 1, urgent: 0, attention: 0, covers: 0 },
      { handledBy: "left@firma.cz", isUser: false, active: 1, urgent: 1, attention: 0, covers: 0 },
    ]);
  });

  it("says not known when the users could not be read - an empty answer is not \"nobody is a user\"", async () => {
    users.userEmails.mockResolvedValue(new Map());
    shipments.managersCockpitRows.mockResolvedValue([row(1), row(2, { personInCharge: "left@firma.cz" })]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.tiles.handledByNotUser).toBeNull();
    expect(c.people.map((p) => p.isUser)).toEqual([null, null]);
    expect(c.urgent.total).toBe(0);
  });

  it("fails rather than count 0 when a read of the jobs or their facts fails", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1)]);
    containers.withFreeTime.mockRejectedValue(new Error("containers could not be read"));
    await expect(managersCockpitService.cockpit(COMPANY, EVERYONE, NOW)).rejects.toThrow("containers could not be read");
    containers.withFreeTime.mockResolvedValue([]);
    shipments.dateMovedLately.mockRejectedValue(new Error("the log could not be read"));
    await expect(managersCockpitService.cockpit(COMPANY, EVERYONE, NOW)).rejects.toThrow("the log could not be read");
    shipments.dateMovedLately.mockResolvedValue([]);
    shipments.managersCockpitRows.mockRejectedValue(new Error("the jobs could not be read"));
    await expect(managersCockpitService.cockpit(COMPANY, EVERYONE, NOW)).rejects.toThrow("the jobs could not be read");
  });
});

// Needs Attention reads its facts through the same function since Shipments → Managers does:
// what it answers must not have changed.
describe("Needs Attention, on the shared facts", () => {
  it("still lists the shipments with a flag, each with its own facts, the urgent first", async () => {
    shipments.trackingAttentionCandidates.mockResolvedValue([
      { ...row(1), customerId: "c1" },
      { ...row(2), customerId: null, estimatedArrival: "2026-11-10" },
      { ...row(3), customerId: null },
      { ...row(4), customerId: null, tradeDirection: "Export" },
    ]);
    containers.withFreeTime.mockResolvedValue([
      { shipmentId: "id-3", containerNumber: "BBBU2", freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: "2026-11-19" },
      { shipmentId: "id-3", containerNumber: "", freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: "2026-11-01" },
      // An export's box runs no clock here.
      { shipmentId: "id-4", containerNumber: "CCCU3", freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: "2026-11-01" },
    ]);
    const { items, capped } = await trackingAttentionService.list(COMPANY, NOW);
    expect(capped).toBe(false);
    expect(items).toEqual([
      { id: "id-2", jobNumber: "CZFCL00000002", customerId: null, customer: "ACME s.r.o.", tradeDirection: "Import", status: "Booked [IMP]", flags: [expect.objectContaining({ kind: "eta_passed", severity: "urgent" })] },
      { id: "id-3", jobNumber: "CZFCL00000003", customerId: null, customer: "ACME s.r.o.", tradeDirection: "Import", status: "Booked [IMP]", flags: [expect.objectContaining({ kind: "free_time", severity: "attention", detail: "BBBU2 in 1 d" })] },
    ]);
    expect(shipments.trackingAttentionCandidates).toHaveBeenCalledWith(COMPANY, 1001);
    expect(containers.withFreeTime).toHaveBeenCalledWith(["id-1", "id-2", "id-3", "id-4"], COMPANY);
  });
});
