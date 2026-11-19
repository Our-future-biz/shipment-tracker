import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ managersCockpitRows: vi.fn(), managersCockpitClaimOnlyRows: vi.fn(), dateMovedLately: vi.fn(), trackingAttentionCandidates: vi.fn() }));
const events = vi.hoisted(() => ({ proposedOn: vi.fn(), latestPerShipment: vi.fn(), arrivedAtHub: vi.fn(), ofKinds: vi.fn() }));
const notices = vi.hoisted(() => ({ latestPerShipment: vi.fn() }));
const containers = vi.hoisted(() => ({ withFreeTime: vi.fn(), listByShipmentIds: vi.fn() }));
const claims = vi.hoisted(() => ({ openCargoClaimsByShipmentIds: vi.fn() }));
const claimLimits = vi.hoisted(() => ({ of: vi.fn() }));
const holidays = vi.hoisted(() => ({ _internalHolidaysCzNational: vi.fn() }));
const extra = vi.hoisted(() => ({ extraSignals: vi.fn() }));
const team = vi.hoisted(() => ({ cockpitUsers: vi.fn(), teamFacts: vi.fn() }));
const dismissals = vi.hoisted(() => ({ cutoffDismissalsOf: vi.fn(), DISMISSALS_NOT_KNOWN: "dismissed cut-offs" }));
const auditLine = vi.hoisted(() => ({ managersAuditLine: vi.fn(), AUDIT_PARTS: { all: "the audit line" } }));
const handover = vi.hoisted(() => ({ handoverFacts: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ holidays }));
// The other tables' reads have their own test (tests/services/managersCockpitExtra.service.test.ts): here only how their answer is wired in.
vi.mock("../../services/managersCockpitExtra.service", () => extra);
// The same for step 3's reads - the people around the jobs (tests/services/managersCockpitTeam.service.test.ts),
// the audit line (tests/services/managersCockpitAudit.service.test.ts) and the dismissed cut-offs (builder M's).
vi.mock("../../services/managersCockpitTeam.service", () => team);
vi.mock("../../services/cutoffDismissal.service", () => dismissals);
vi.mock("../../services/managersCockpitAudit.service", () => auditLine);
// And step 5's calls to the warehouse and Trucking (tests/services/managersCockpitHandover.service.test.ts).
vi.mock("../../services/managersCockpitHandover.service", () => handover);
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: events }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: notices }));
vi.mock("../../repositories/shipmentClaim.repository", () => ({ shipmentClaimRepository: claims }));
vi.mock("../../services/claimTimeLimits.service", () => ({ claimTimeLimitsService: claimLimits }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: containers }));

import { COCKPIT_CLAIM_ONLY_JOB_LIMIT, COCKPIT_JOB_LIMIT } from "../../lib/cockpitThresholds";
import { handoverFactsOf } from "../../lib/managersCockpitHandover";
import { NO_TEAM_FACTS, type TeamFacts } from "../../lib/managersCockpitTeam";
import { NOT_KNOWN, REPORTS_NOT_KNOWN, managersCockpitService } from "../../services/managersCockpit.service";
import { trackingAttentionService } from "../../services/trackingAttention.service";

// The reads of Shipments → Managers, against stand-ins for the repositories: how many jobs it
// asks for, that every side read gets the jobs it kept, and what it says when a read fails. The
// rules themselves are tests/managersCockpit.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// Wednesday 18 Nov 2026, 00:30 in Prague - still the 17th in UTC.
const NOW = new Date("2026-11-17T23:30:00Z");
const MANAGER = "u-manager";
const EVERYONE = { mode: "all", direction: "all", handledBy: null, reports: "all", userId: MANAGER } as const;
const USERS = [
  { id: "u1", email: "jan@firma.cz", reportsToUserId: MANAGER },
  { id: "u2", email: "eva@firma.cz", reportsToUserId: null },
  { id: MANAGER, email: "boss@firma.cz", reportsToUserId: null },
];
/** Everything read, nothing found: no signal, and every figure of the people line a 0. */
const QUIET_TEAM: TeamFacts = { byJob: new Map(), known: { todos: true, mentions: true, touched: true, coverSince: true }, notKnown: [] };
const NO_AUDIT = { audit: { days: 7, items: [] }, notKnown: [] };
/** The warehouse and Trucking asked, and nothing in play there. */
const QUIET_HANDOVER = handoverFactsOf({ shipments: [], notKnown: [] }, { shipments: [], notKnown: [], issuesRead: true, updatesRead: true });
/** A person of the people line with nothing on them but their jobs. */
const person = (handledBy: string, over = {}) => ({
  handledBy,
  isUser: true,
  active: 1,
  urgent: 0,
  attention: 0,
  covers: 0,
  byMode: { sea: 1, air: 0, rail: 0, road: 0 },
  todosLate: 0,
  mentionsUnread: 0,
  notTouched: 0,
  coversSince: null,
  highLoad: false,
  awayUntil: null,
  ...over,
});

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
  shipments.managersCockpitClaimOnlyRows.mockResolvedValue([]);
  shipments.dateMovedLately.mockResolvedValue([]);
  events.proposedOn.mockResolvedValue([]);
  events.latestPerShipment.mockResolvedValue(new Map());
  events.arrivedAtHub.mockResolvedValue(new Set());
  events.ofKinds.mockResolvedValue([]);
  notices.latestPerShipment.mockResolvedValue(new Map());
  containers.withFreeTime.mockResolvedValue([]);
  containers.listByShipmentIds.mockResolvedValue([]);
  holidays._internalHolidaysCzNational.mockResolvedValue({ dates: [] });
  extra.extraSignals.mockResolvedValue(NO_EXTRA);
  team.cockpitUsers.mockResolvedValue(USERS);
  team.teamFacts.mockResolvedValue(QUIET_TEAM);
  dismissals.cutoffDismissalsOf.mockResolvedValue(new Map());
  auditLine.managersAuditLine.mockResolvedValue(NO_AUDIT);
  handover.handoverFacts.mockResolvedValue(QUIET_HANDOVER);
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
    expect(extra.extraSignals.mock.lastCall![1]).toEqual({ companyId: COMPANY, now: NOW, today: "2026-11-18", holidays: ["2026-11-19"], run: expect.any(Function) });
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
    const c = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, mode: "air", direction: "import", handledBy: "nobody" }, NOW);
    expect(c).toMatchObject({ mode: "air", direction: "import", handledBy: "nobody", reports: "all", signal: null, tiles: { active: 1, noHandledBy: 1 } });
  });

  it("hands the signal tile on: the cards hold only its rows, the tiles count every job", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { personInCharge: "" }), row(2, { personInCharge: "left@firma.cz" })]);
    const whole = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    const narrowed = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, signal: "not_user" }, NOW);
    expect(narrowed.signal).toBe("not_user");
    expect(narrowed.urgent.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000002"]);
    // The job nobody handles is a row of the whole card only.
    expect(whole.urgent.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000001", "CZFCL00000002"]);
    expect(narrowed.tiles).toEqual(whole.tiles);
  });

  it("knows the users by e-mail: who is none of them is said, on the tile and on the people line", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1), row(2, { personInCharge: "left@firma.cz" })]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.tiles.handledByNotUser).toBe(1);
    expect(c.people).toEqual([person("jan@firma.cz"), person("left@firma.cz", { isUser: false, urgent: 1 })]);
  });

  it("says not known when the users could not be read - never \"nobody is a user\" - and tells the other reads so", async () => {
    team.cockpitUsers.mockResolvedValue(null);
    shipments.managersCockpitRows.mockResolvedValue([row(1), row(2, { personInCharge: "left@firma.cz" })]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.tiles.handledByNotUser).toBeNull();
    expect(c.people.map((p) => p.isUser)).toEqual([null, null]);
    expect(c.urgent.total).toBe(0);
    // Whom a chat line tagged and who did what on the audit line hang on the users too.
    expect(team.teamFacts.mock.lastCall![1].users).toBeNull();
    expect(auditLine.managersAuditLine).toHaveBeenLastCalledWith(COMPANY, NOW, null, expect.any(Function));
  });

  describe("the people around the jobs (step 3)", () => {
    const signal = (over = {}) => ({ rank: 410, urgent: false, kind: "todo", area: "details", text: 'To-do 2 days late: "Call the carrier"', ...over });
    const NOT_TOUCHED = { rank: 430, urgent: false, kind: "not_touched", area: "details", text: "Not touched since 10.11." };
    const facts = (over = {}) => ({ signals: [], notTouched: null, todosLate: 0, mentionsUnread: new Map(), coverSince: null, ...over });

    it("is asked about the jobs kept, on the one `now`, with the company's days off and its users - and its signals and figures land on the rows and the people line", async () => {
      shipments.managersCockpitRows.mockResolvedValue([row(1), row(2, { closingDate: "2026-11-19" }), row(3, { personInCharge: "eva@firma.cz", holidayCover: "jan@firma.cz" })]);
      holidays._internalHolidaysCzNational.mockResolvedValue({ dates: ["2026-11-23"] });
      team.teamFacts.mockResolvedValue({
        ...QUIET_TEAM,
        byJob: new Map([
          ["id-1", facts({ signals: [signal()], notTouched: NOT_TOUCHED, todosLate: 2 })],
          // Something URGENT stands on it already: it is being looked at, and is not called untouched.
          ["id-2", facts({ notTouched: NOT_TOUCHED })],
          ["id-3", facts({ signals: [signal({ rank: 96, urgent: true, kind: "mention", text: "@mention unread since 16.11. 09:12 (jan@firma.cz)" })], mentionsUnread: new Map([["jan@firma.cz", 3]]), coverSince: "2026-11-02" })],
        ]),
      });
      const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(team.teamFacts.mock.lastCall![0].map((j: { id: string }) => j.id)).toEqual(["id-1", "id-2", "id-3"]);
      expect(team.teamFacts.mock.lastCall![1]).toEqual({ companyId: COMPANY, now: NOW, today: "2026-11-18", holidays: ["2026-11-23"], users: USERS, run: expect.any(Function) });
      expect(c.urgent.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([
        ["CZFCL00000002", ["Closing tomorrow"]],
        ["CZFCL00000003", ["@mention unread since 16.11. 09:12 (jan@firma.cz)"]],
      ]);
      expect(c.attention.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([["CZFCL00000001", ['To-do 2 days late: "Call the carrier"', "Not touched since 10.11."]]]);
      expect(c.tiles.signals).toMatchObject({ todo: 1, mention: 1, not_touched: 1 });
      expect(c.people).toEqual([
        person("jan@firma.cz", { active: 2, urgent: 1, attention: 1, covers: 1, byMode: { sea: 2, air: 0, rail: 0, road: 0 }, todosLate: 2, mentionsUnread: 3, notTouched: 1, coversSince: "2026-11-02" }),
        person("eva@firma.cz", { urgent: 1 }),
      ]);
      expect(c.notKnown).toEqual([]);
    });

    it("passes on what it could not read: no signal of that part, its figures null - not 0 - and its name", async () => {
      shipments.managersCockpitRows.mockResolvedValue([row(1)]);
      team.teamFacts.mockResolvedValue({ byJob: new Map(), known: { todos: true, mentions: false, touched: false, coverSince: true }, notKnown: ["@mentions not read", "jobs nobody touched"] });
      const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(c.people).toEqual([person("jan@firma.cz", { mentionsUnread: null, notTouched: null })]);
      expect(c.notKnown).toEqual(["@mentions not read", "jobs nobody touched"]);
    });

    it("answers without it when its read fails altogether: none of its figures, and it says which", async () => {
      shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-19" })]);
      team.teamFacts.mockRejectedValue(new Error("boom"));
      const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(c.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Closing tomorrow"]]);
      expect(c.people).toEqual([person("jan@firma.cz", { urgent: 1, todosLate: null, mentionsUnread: null, notTouched: null })]);
      // Named once, as a whole - not part by part.
      expect(c.notKnown).toEqual([NOT_KNOWN.team]);
      expect(NO_TEAM_FACTS.known).toEqual({ todos: false, mentions: false, touched: false, coverSince: false });
    });
  });

  describe("a missed cut-off a manager dismissed (step 3)", () => {
    const jobs = () => [
      row(1, { closingDate: "2026-11-17", vgmClosing: "2026-11-16", vgm: "Pending (Red)", estimatedDeparture: "2026-11-20" }),
      row(2, { siClosing: "2026-11-19", estimatedDeparture: "2026-11-25" }),
      row(3, { vgmClosing: "2026-11-16", vgm: "Pending (Red)", estimatedDeparture: "2026-11-20" }),
    ];

    it("asks only about the jobs with a missed cut-off, and gives no tag for the one dismissed while its date stands", async () => {
      shipments.managersCockpitRows.mockResolvedValue(jobs());
      dismissals.cutoffDismissalsOf.mockResolvedValue(
        new Map([
          // The Closing of the 17th is dismissed; the VGM's dismissal is of another date - the cut-off was moved since.
          ["id-1", [{ cutoff: "closingDate", date: "2026-11-17" }, { cutoff: "vgmClosing", date: "2026-11-13" }]],
        ]),
      );
      const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(dismissals.cutoffDismissalsOf).toHaveBeenCalledTimes(1);
      expect(dismissals.cutoffDismissalsOf).toHaveBeenCalledWith(COMPANY, ["id-1", "id-3"]);
      expect(c.urgent.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([
        ["CZFCL00000001", ["VGM overdue 2 days"]],
        ["CZFCL00000003", ["VGM overdue 2 days"]],
        ["CZFCL00000002", ["SI closing tomorrow"]],
      ]);
      expect(c.tiles.cutoffsDue).toBe(3);
      expect(c.notKnown).toEqual([]);
    });

    it("asks too about a job whose cargo is ready only after its Closing, and says nothing of that cargo once the Closing is dismissed", async () => {
      // The ETD passed: "Closing missed" no longer counts, the cargo ready after it still would.
      shipments.managersCockpitRows.mockResolvedValue([row(4, { closingDate: "2026-11-16", cargoReadinessDate: "2026-11-17", estimatedDeparture: "2026-11-17" })]);
      const before = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(dismissals.cutoffDismissalsOf).toHaveBeenLastCalledWith(COMPANY, ["id-4"]);
      expect(before.urgent.rows.flatMap((r) => r.tags.map((t) => t.text))).toContain("Cargo ready 17.11., after Closing 16.11.");
      dismissals.cutoffDismissalsOf.mockResolvedValue(new Map([["id-4", [{ cutoff: "closingDate", date: "2026-11-16" }]]]));
      const after = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(after.urgent.rows.flatMap((r) => r.tags.map((t) => t.text))).not.toContain("Cargo ready 17.11., after Closing 16.11.");
    });

    it("treats nothing as dismissed when the dismissals could not be read, and says so", async () => {
      shipments.managersCockpitRows.mockResolvedValue(jobs());
      dismissals.cutoffDismissalsOf.mockRejectedValue(new Error("the dismissals could not be read"));
      const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(c.urgent.rows.find((r) => r.jobNumber === "CZFCL00000001")!.tags.map((t) => t.text)).toEqual(["Closing missed · 17.11.", "VGM overdue 2 days"]);
      expect(c.notKnown).toEqual(["dismissed cut-offs"]);
    });
  });

  describe("the audit line (step 3)", () => {
    it("is the company's, read on the one `now` with the users, and handed through as it is - with what it could not read", async () => {
      shipments.managersCockpitRows.mockResolvedValue([row(1)]);
      const audit = { days: 7, items: [{ key: "deleted", count: 2 }, { key: "requests_decided", count: 12, approvalRate: 1 }] };
      auditLine.managersAuditLine.mockResolvedValue({ audit, notKnown: ["audit: documents approved by their uploader"] });
      const c = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, mode: "air", handledBy: "eva@firma.cz" }, NOW);
      expect(auditLine.managersAuditLine).toHaveBeenCalledWith(COMPANY, NOW, new Map([["u1", "jan@firma.cz"], ["u2", "eva@firma.cz"], [MANAGER, "boss@firma.cz"]]), expect.any(Function));
      expect(c.audit).toEqual(audit);
      expect(c.notKnown).toEqual(["audit: documents approved by their uploader"]);
    });

    it("is null - and named - when it could not be read at all; the rest still answers", async () => {
      shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-19" })]);
      auditLine.managersAuditLine.mockRejectedValue(new Error("boom"));
      const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(c.audit).toBeNull();
      expect(c.notKnown).toEqual(["the audit line"]);
      expect(c.urgent.total).toBe(1);
    });
  });

  it("hands the one limiter to every reader that sends statements of its own (the whole call is tests/services/managersCockpitReads.test.ts)", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1)]);
    await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    const run = team.teamFacts.mock.lastCall![1].run;
    expect(extra.extraSignals.mock.lastCall![1].run).toBe(run);
    expect(auditLine.managersAuditLine.mock.lastCall![3]).toBe(run);
    // Shared by every answer, of every company: the pool's connections are the same for all of them.
    await managersCockpitService.cockpit("0d6f5a1e-2b8c-4c3d-9e7f-1a2b3c4d5e6f", EVERYONE, NOW);
    expect(team.teamFacts.mock.lastCall![1].run).toBe(run);
  });

  describe("\"My reports\" (step 3, D3)", () => {
    const jobs = () => [row(1), row(2, { personInCharge: "eva@firma.cz" }), row(3, { personInCharge: "" }), row(4, { personInCharge: "JAN@firma.cz", closingDate: "2026-11-19" })];

    it("keeps only the jobs handled by the users who report to the caller - tiles, cards and the people line", async () => {
      shipments.managersCockpitRows.mockResolvedValue(jobs());
      const c = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, reports: "mine" }, NOW);
      expect(c.reports).toBe("mine");
      expect(c.tiles).toMatchObject({ active: 2, noHandledBy: 0 });
      expect(c.urgent.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000004"]);
      expect(c.people.map((p) => [p.handledBy, p.active])).toEqual([["jan@firma.cz", 2]]);
      // Everybody's is everybody's.
      const all = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(all).toMatchObject({ reports: "all", tiles: { active: 4, noHandledBy: 1 } });
    });

    it("keeps the jobs of somebody who is no user - a report who was deactivated - for every manager, whoever reports to them", async () => {
      shipments.managersCockpitRows.mockResolvedValue([...jobs(), row(5, { personInCharge: "left@firma.cz" })]);
      for (const userId of [MANAGER, "u2"]) {
        const c = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, reports: "mine", userId }, NOW);
        expect(c.urgent.rows.filter((r) => r.handledBy === "left@firma.cz").map((r) => r.tags.map((t) => t.text))).toEqual([["Handled By is not a user: left@firma.cz"]]);
        expect(c.people.map((p) => p.handledBy)).toContain("left@firma.cz");
      }
      expect((await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, reports: "mine", userId: "u2" }, NOW)).tiles).toMatchObject({ active: 1, handledByNotUser: 1 });
    });

    it("is empty for somebody nobody reports to: that is known, and is nothing", async () => {
      shipments.managersCockpitRows.mockResolvedValue(jobs());
      const c = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, reports: "mine", userId: "u2" }, NOW);
      expect(c).toMatchObject({ reports: "mine", tiles: { active: 0 }, people: [] });
    });

    it("is refused when the users could not be read: who reports to whom is not known, and an empty page would say \"nothing\"", async () => {
      shipments.managersCockpitRows.mockResolvedValue(jobs());
      team.cockpitUsers.mockResolvedValue(null);
      await expect(managersCockpitService.cockpit(COMPANY, { ...EVERYONE, reports: "mine" }, NOW)).rejects.toThrow(REPORTS_NOT_KNOWN);
      // Everybody's jobs need no users to be listed.
      expect((await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW)).tiles.active).toBe(4);
    });
  });

  describe("the warehouse and Trucking (step 5)", () => {
    // A Domestic job whose pick-up day passed with nothing on its timeline, and one arriving to our warehouse.
    const jobs = () => [
      row(1, { tradeDirection: "Domestic", freightMode: "", pickupDate: "2026-11-17" }),
      row(2, { etaWarehouse: "2026-11-16", personInCharge: "eva@firma.cz" }),
      row(3),
    ];
    const issue = (over = {}) => ({ kind: "not_picked_up" as const, text: "Pick-up date passed and no pick-up stamped", urgent: true, since: "2026-11-17", ...over });
    const consignment = (ref: string, issues: ReturnType<typeof issue>[]) => ({ id: `c-${ref}`, ref, status: "Ordered", pickupDate: "2026-11-17", deliveryDate: null, issues });
    const record = (ref: string, signals: { text: string; urgent: boolean }[]) => ({ id: `r-${ref}`, ref, lifecycle: "Expected", signals });
    const warehouseAnswer = {
      shipments: [
        { shipmentId: "id-1", records: [], updatesWaiting: 0, updatesFailed: 0 },
        { shipmentId: "id-2", records: [record("WCZ00012", [{ text: "Not arrived: expected 16.11.2026", urgent: true }])], updatesWaiting: 2, updatesFailed: 1 },
        { shipmentId: "id-3", records: [], updatesWaiting: 0, updatesFailed: 0 },
      ],
      notKnown: [],
    };
    const truckingAnswer = { shipments: [{ shipmentId: "id-1", consignments: [consignment("TCZ00031", [issue()])], updatesWaiting: 1, updatesFailed: 0 }], notKnown: [], issuesRead: true, updatesRead: true };
    const byJob = (c: Awaited<ReturnType<typeof managersCockpitService.cockpit>>) =>
      [...c.urgent.rows, ...c.attention.rows].map((r) => [r.jobNumber, r.tags.map((t) => t.text)]);

    it("asks about every job read - not only the page's - on the one `now`, first, and not through the answer's limiter", async () => {
      shipments.managersCockpitRows.mockResolvedValue(jobs());
      await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, mode: "air", handledBy: "eva@firma.cz" }, NOW);
      expect(handover.handoverFacts).toHaveBeenCalledTimes(1);
      expect(handover.handoverFacts).toHaveBeenCalledWith(["id-1", "id-2", "id-3"], { companyId: COMPANY, now: NOW });
      // Before any statement of the answer's own.
      const first = handover.handoverFacts.mock.invocationCallOrder[0]!;
      for (const read of [events.ofKinds, shipments.dateMovedLately, extra.extraSignals, team.teamFacts, auditLine.managersAuditLine]) expect(read.mock.invocationCallOrder[0]!).toBeGreaterThan(first);
    });

    it("tags the jobs in the modules' own words, drops step 2's tags of the same meaning, and counts the hand-overs of the page's jobs", async () => {
      shipments.managersCockpitRows.mockResolvedValue(jobs());
      handover.handoverFacts.mockResolvedValue(handoverFactsOf(warehouseAnswer, truckingAnswer));
      const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(byJob(c)).toEqual([
        ["CZFCL00000002", ["Warehouse · WCZ00012: Not arrived: expected 16.11.2026"]],
        ["CZFCL00000001", ["Trucking · TCZ00031: Pick-up date passed and no pick-up stamped"]],
      ]);
      expect(c.tiles.signals).toMatchObject({ warehouse: 1, road: 1 });
      expect(c.handover).toEqual({ warehouseUpdatesWaiting: 2, warehouseUpdatesFailed: 1, truckingUpdatesWaiting: 1, truckingUpdatesFailed: 0 });
      expect(c.notKnown).toEqual([]);
      // The filters narrow the line as they narrow the tiles.
      const eva = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, handledBy: "eva@firma.cz" }, NOW);
      expect(eva.handover).toEqual({ warehouseUpdatesWaiting: 2, warehouseUpdatesFailed: 1, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 });
    });

    it("keeps step 2's own tags, and gives no figure, of a module that could not be read - and names it", async () => {
      shipments.managersCockpitRows.mockResolvedValue(jobs());
      handover.handoverFacts.mockResolvedValue(handoverFactsOf(null, null));
      const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
      expect(byJob(c)).toEqual([
        ["CZFCL00000002", ["ETA warehouse 16.11. passed, not received"]],
        ["CZFCL00000001", ["Pick-up 17.11. passed, not picked up"]],
      ]);
      expect(c.handover).toEqual({ warehouseUpdatesWaiting: null, warehouseUpdatesFailed: null, truckingUpdatesWaiting: null, truckingUpdatesFailed: null });
      expect(c.notKnown).toEqual(["the warehouse's records", "Trucking's consignments"]);
    });
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

describe("Shipments → Managers' cargo claims (step 6, D21)", () => {
  const claimRow = (over = {}) => ({
    id: "claim-1",
    shipmentId: "id-1",
    createdAt: new Date("2026-11-01T09:00:00Z"),
    status: "open",
    cargoState: "Damaged",
    note: "",
    claimAmount: null,
    claimCurrency: "",
    noticeDate: null,
    insurerNotifiedOn: null,
    ...over,
  });
  const ON = { enabled: true, limits: { sea: { noticeDays: 3, suitMonths: 12 }, air: { noticeDays: 14, suitMonths: 24 }, rail: { noticeDays: 7, suitMonths: 12 }, road: { noticeDays: 7, suitMonths: 12 } } };
  const OFF = { enabled: false, limits: ON.limits };
  const claimTags = (c: { urgent: { rows: { tags: { kind?: string; text: string; urgent: boolean }[] }[] }; attention: { rows: { tags: { kind?: string; text: string; urgent: boolean }[] }[] } }) =>
    [...c.urgent.rows, ...c.attention.rows].flatMap((r) => r.tags.filter((t) => t.kind === "claim").map((t) => `${t.urgent ? "URGENT" : "attention"} ${t.text}`));

  beforeEach(() => {
    claims.openCargoClaimsByShipmentIds.mockResolvedValue([claimRow()]);
    claimLimits.of.mockResolvedValue(OFF);
  });

  it("asks only about the jobs whose Claim field says Yes, and for the limits only when one has an open claim", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1), row(2)]);
    await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(claims.openCargoClaimsByShipmentIds).not.toHaveBeenCalled();
    expect(claimLimits.of).not.toHaveBeenCalled();

    shipments.managersCockpitRows.mockResolvedValue([row(1, { claim: "Yes" }), row(2)]);
    claims.openCargoClaimsByShipmentIds.mockResolvedValue([]);
    await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(claims.openCargoClaimsByShipmentIds).toHaveBeenCalledWith(COMPANY, ["id-1"]);
    expect(claimLimits.of).not.toHaveBeenCalled();
  });

  it("with the time limits off says only how long an open claim has stood", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { claim: "Yes", actualDeliveryDate: "2026-11-16" })]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(claimLimits.of).toHaveBeenCalledWith(COMPANY);
    expect(claimTags(c)).toEqual(["attention Cargo claim open since 01.11."]);
    expect(c.tiles.signals.claim).toBe(1);
    expect(c.notKnown).toEqual([]);
  });

  it("with them on tags the carrier's notice and the time bar instead", async () => {
    claimLimits.of.mockResolvedValue(ON);
    shipments.managersCockpitRows.mockResolvedValue([row(1, { claim: "Yes", actualDeliveryDate: "2026-11-16" })]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    // Sea: 3 days from the delivery on the 16th - the 19th, and today is the 18th.
    expect(claimTags(c)).toEqual(["URGENT Cargo claim: notify the carrier by 19.11."]);
  });

  it("names what it could not read and tags nothing it can't know", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { claim: "Yes" })]);
    claims.openCargoClaimsByShipmentIds.mockRejectedValue(new Error("down"));
    const lost = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(claimTags(lost)).toEqual([]);
    expect(lost.notKnown).toEqual(["cargo claims"]);

    claims.openCargoClaimsByShipmentIds.mockResolvedValue([claimRow()]);
    claimLimits.of.mockRejectedValue(new Error("down"));
    const noLimits = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    // No time-limit tag; how long the claim has stood is no time limit.
    expect(claimTags(noLimits)).toEqual(["attention Cargo claim open since 01.11."]);
    expect(noLimits.notKnown).toEqual(["claim time limits"]);
  });

  // Review: the invoiced or cancelled jobs with an open cargo claim are read one more than kept, so
  // that more of them than the limit is said, and the one left out is asked about nowhere.
  it("reads one invoiced or cancelled job with a claim more than it keeps, and names the cap only when there was one", async () => {
    const closed = (n: number) => Array.from({ length: n }, (_, i) => row(5000 + i, { claim: "Yes", invoicingStatus: "Invoiced" }));
    claims.openCargoClaimsByShipmentIds.mockResolvedValue([]);
    shipments.managersCockpitClaimOnlyRows.mockResolvedValue(closed(COCKPIT_CLAIM_ONLY_JOB_LIMIT));
    const all = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(shipments.managersCockpitClaimOnlyRows).toHaveBeenCalledWith(COMPANY, COCKPIT_CLAIM_ONLY_JOB_LIMIT + 1);
    expect(all.notKnown).toEqual([]);
    expect(all.tiles.openClaims).toBe(COCKPIT_CLAIM_ONLY_JOB_LIMIT);

    shipments.managersCockpitClaimOnlyRows.mockResolvedValue(closed(COCKPIT_CLAIM_ONLY_JOB_LIMIT + 1));
    const cut = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(cut.notKnown).toEqual([NOT_KNOWN.claimOnlyCapped]);
    expect(NOT_KNOWN.claimOnlyCapped).toBe("cargo claims of invoiced or cancelled jobs older than the newest 500");
    expect(cut.tiles.openClaims).toBe(COCKPIT_CLAIM_ONLY_JOB_LIMIT);
    expect(cut.capped).toBe(false);
    const asked = claims.openCargoClaimsByShipmentIds.mock.lastCall![1] as string[];
    expect(asked).toHaveLength(COCKPIT_CLAIM_ONLY_JOB_LIMIT);
    expect(asked).not.toContain(`id-${5000 + COCKPIT_CLAIM_ONLY_JOB_LIMIT}`);
  });

  it("names the invoiced or cancelled jobs' claims, not a cap, when their read failed", async () => {
    shipments.managersCockpitClaimOnlyRows.mockRejectedValue(new Error("down"));
    const lost = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(lost.notKnown).toEqual(["claims of invoiced or cancelled jobs"]);
  });
});
