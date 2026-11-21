import { beforeEach, describe, expect, it, vi } from "vitest";

// One answer of Shipments → Managers from end to end - the cockpit's service and every reader it
// calls (Needs Attention's facts, the other tables' signals, the people around the jobs, the
// dismissed cut-offs, the audit line, the calls to the warehouse and Trucking) as they are - against
// stand-ins for the repositories and the two modules only: each repository method is a statement
// that holds a connection for a moment; each module's endpoint is a call that holds none of
// Shipments' connections, and is slow here. How many statements and calls an answer sends, that
// the calls start first and outside the limiter, and that the statements never hold more than
// five connections at once.
const db = vi.hoisted(() => {
  // `expected`: the statements the answer sends, which a call waits for (see `call`); 0 - it answers at once.
  const state = { running: 0, peak: 0, sent: [] as string[], calls: [] as { name: string; statementsBefore: number; statementsDoneAtEnd: number }[], done: 0, expected: 0 };
  /** A repository of which every method is a statement answering `answers[method]` ([] when not named). */
  const repository = (name: string, answers: Record<string, () => unknown> = {}) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => async () => {
          state.peak = Math.max(state.peak, ++state.running);
          state.sent.push(`${name}.${method}`);
          await new Promise((done) => setTimeout(done, 1));
          state.running -= 1;
          state.done += 1;
          return answers[method] ? answers[method]!() : [];
        },
      },
    );
  /**
   * A module's endpoint: a slow call, counted apart from the statements, that answers nothing in play. It is out
   * until the answer's statements are all done (`expected`), or 2 s at most: so "the statements all ran while
   * the calls were out" holds however busy the machine is (a fixed 40 ms did not, on a loaded test run), and a
   * service that waited for the calls before its statements still fails - on the count, after the 2 s.
   */
  const call = (name: string) => async () => {
    const entry = { name, statementsBefore: state.sent.length, statementsDoneAtEnd: 0 };
    state.calls.push(entry);
    const started = Date.now();
    while (state.done < state.expected && Date.now() - started < 2_000) await new Promise((done) => setTimeout(done, 2));
    entry.statementsDoneAtEnd = state.done;
    return { shipments: [], notKnown: [], issuesRead: true, updatesRead: true };
  };
  return { state, repository, call, jobs: [] as unknown[] };
});
const clients = vi.hoisted(() => ({
  auth: { usersList: vi.fn(), absencesList: vi.fn(async () => ({ absences: [] })) },
  holidays: { _internalHolidaysCzNational: vi.fn() },
  warehouseConcept: { _internalWarehouseOperationsFacts: vi.fn(db.call("call.warehouseConcept")) },
  trucking: { _internalTruckingOperationsFacts: vi.fn(db.call("call.trucking")) },
}));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => clients);
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: db.repository("shipment", { managersCockpitRows: () => db.jobs, jobNumbersByIds: () => new Map() }) }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: db.repository("event", { latestPerShipment: () => new Map(), arrivedAtHub: () => new Set() }) }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: db.repository("notice", { latestPerShipment: () => new Map() }) }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: db.repository("container") }));
// Read only for a job a remeasurement from Warehouse Concept still asks to check (Y4): none here.
vi.mock("../../repositories/cargoItem.repository", () => ({ cargoItemRepository: db.repository("cargoItem") }));
vi.mock("../../repositories/cargoDimension.repository", () => ({ cargoDimensionRepository: db.repository("cargoDimension") }));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: db.repository("attachment") }));
vi.mock("../../repositories/documentChangeRequest.repository", () => ({ documentChangeRequestRepository: db.repository("documentRequest") }));
vi.mock("../../repositories/customsOfficeRequest.repository", () => ({ customsOfficeRequestRepository: db.repository("officeRequest") }));
vi.mock("../../repositories/shipmentImportInstruction.repository", () => ({ shipmentImportInstructionRepository: db.repository("importInstruction") }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: db.repository("history", { lastTouchedSince: () => new Map() }) }));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: db.repository("masterJob", { shipmentCounts: () => new Map() }) }));
vi.mock("../../repositories/shipmentNote.repository", () => ({ shipmentNoteRepository: db.repository("note") }));
vi.mock("../../repositories/shipmentComment.repository", () => ({ shipmentCommentRepository: db.repository("comment") }));
vi.mock("../../repositories/shipmentReleaseRequest.repository", () => ({ shipmentReleaseRequestRepository: db.repository("releaseRequest") }));
vi.mock("../../repositories/shipmentReleaseOverride.repository", () => ({ shipmentReleaseOverrideRepository: db.repository("releaseOverride") }));
vi.mock("../../repositories/shipmentClaim.repository", () => ({ shipmentClaimRepository: db.repository("claim") }));
vi.mock("../../repositories/claimTimeLimits.repository", () => ({ claimTimeLimitsRepository: db.repository("claimTimeLimits", { of: () => null }) }));
vi.mock("../../repositories/shipmentCutoffDismissal.repository", () => ({ shipmentCutoffDismissalRepository: db.repository("dismissal") }));

import { COCKPIT_READS_AT_ONCE } from "../../lib/cockpitThresholds";
import { managersCockpitService } from "../../services/managersCockpit.service";
import { forgetAuditLines } from "../../services/managersCockpitAudit.service";
import { forgetHandoverFacts } from "../../services/managersCockpitHandover.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");
const EVERYONE = { mode: "all", direction: "all", handledBy: null, reports: "all", userId: "u-boss" } as const;

const job = (n: number, over = {}) => ({
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
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-01T08:00:00Z"),
  arrivalNoticeSent: true,
  ...over,
});

/** The statements of one answer when every read has something to ask about, by who sends them. */
const EVERY_ANSWER = [
  // The jobs themselves, before anything else.
  "shipment.managersCockpitRows",
  // The service's own.
  "event.ofKinds",
  "shipment.dateMovedLately",
  // The jobs no longer active that still have a claim (X8).
  "shipment.managersCockpitClaimOnlyRows",
  "container.listByShipmentIds",
  "dismissal.liveByShipmentIds",
  // Needs Attention's facts (services/trackingAttention.service).
  "event.proposedOn",
  "event.latestPerShipment",
  "event.arrivedAtHub",
  "notice.latestPerShipment",
  "container.withFreeTime",
  // The other tables' signals (services/managersCockpitExtra.service).
  "attachment.reviewFactsByShipmentIds",
  "documentRequest.waitingByShipmentIds",
  "officeRequest.waitingByShipmentIds",
  "importInstruction.liveByShipmentIds",
  "history.latestByShipmentIds",
  "masterJob.cockpitFacts",
  "masterJob.shipmentCounts",
  // The people around the jobs (services/managersCockpitTeam.service).
  "note.lateByShipmentIds",
  "comment.unreadMentionsByShipmentIds",
  "history.lastTouchedSince",
  "history.latestByShipmentIds",
  "releaseRequest.waitingByShipmentIds",
];
/** The audit line, when it is read (services/managersCockpitAudit.service). */
const AUDIT_LINE = ["history.changesSince", "releaseOverride.listSince", "attachment.ownApprovalsSince", "documentRequest.decidedSince", "officeRequest.decidedSince", "releaseRequest.decidedSince"];
/** The calls to the warehouse and Trucking, when they are made (services/managersCockpitHandover.service): one each. */
const HANDOVER_CALLS = ["call.warehouseConcept", "call.trucking"];
const callsMade = () => db.state.calls.map((c) => c.name);

beforeEach(() => {
  forgetAuditLines();
  forgetHandoverFacts();
  db.state.running = 0;
  db.state.peak = 0;
  db.state.sent.length = 0;
  db.state.calls.length = 0;
  db.state.done = 0;
  db.state.expected = 0;
  // Jobs that give every read something to ask about: a missed cut-off, a Full Load import arriving, a Holiday Cover.
  db.jobs = [
    job(1, { vgmClosing: "2026-11-16", vgm: "Pending (Red)", estimatedDeparture: "2026-11-20" }),
    job(2, { loadType: "Full Load", estimatedArrival: "2026-11-20", holidayCover: "eva@firma.cz" }),
    job(3),
  ];
  clients.auth.usersList.mockResolvedValue({
    users: [
      { id: "u-jan", email: "jan@firma.cz", displayName: "Jan", role: "user", reportsToUserId: "u-boss" },
      { id: "u-eva", email: "eva@firma.cz", displayName: "Eva", role: "user", reportsToUserId: null },
      { id: "u-boss", email: "boss@firma.cz", displayName: "Boss", role: "manager", reportsToUserId: null },
    ],
  });
  clients.holidays._internalHolidaysCzNational.mockResolvedValue({ dates: [] });
});

describe("one answer of Shipments → Managers, every statement of it", () => {
  it("never holds more than five connections at once - whoever sends the statement", async () => {
    db.state.expected = 29;
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);

    expect(COCKPIT_READS_AT_ONCE).toBe(5);
    // The peak counts Shipments' statements only: the calls hold none of its connections.
    expect(db.state.peak).toBe(5);
    expect([...db.state.sent].sort()).toEqual([...EVERY_ANSWER, ...AUDIT_LINE].sort());
    expect(db.state.sent).toHaveLength(29);
    // And 2 calls, started first - right after the jobs were read - and outside the limiter: the
    // statements all ran while the two slow calls were out.
    expect(callsMade()).toEqual(HANDOVER_CALLS);
    for (const c of db.state.calls) {
      expect(c.statementsBefore).toBe(1);
      expect(c.statementsDoneAtEnd).toBe(29);
    }
    // Each module is asked once, about every job read.
    expect(clients.warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledWith({ shipmentIds: ["id-1", "id-2", "id-3"] });
    expect(clients.trucking._internalTruckingOperationsFacts).toHaveBeenCalledWith({ shipmentIds: ["id-1", "id-2", "id-3"] });
    // And it is a whole answer: everything was read.
    expect(c).toMatchObject({
      tiles: { active: 3 },
      notKnown: [],
      holidaysKnown: true,
      audit: { days: 7 },
      handover: { warehouseUpdatesWaiting: 0, warehouseUpdatesFailed: 0, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 },
    });
    expect(c.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["VGM overdue 2 days"]]);
    expect(c.people.map((p) => [p.handledBy, p.active, p.covers])).toEqual([
      ["jan@firma.cz", 3, 0],
      ["eva@firma.cz", 0, 1],
    ]);
  });

  it("shares the five with every other answer being built: two companies' pages asking at once hold no more than five together", async () => {
    const OTHER = "0d6f5a1e-2b8c-4c3d-9e7f-1a2b3c4d5e6f";
    db.state.expected = 58;
    await Promise.all([managersCockpitService.cockpit(COMPANY, EVERYONE, NOW), managersCockpitService.cockpit(OTHER, EVERYONE, NOW)]);
    // Each answer whole - nothing of one company's is kept for the other's.
    expect(db.state.sent).toHaveLength(58);
    expect(db.state.peak).toBe(5);
  });

  it("sends six statements fewer and no call while the company's audit line and the modules' answers are kept: 23, and still five at once", async () => {
    db.state.expected = 29;
    await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    db.state.sent.length = 0;
    db.state.calls.length = 0;
    db.state.peak = 0;
    const c = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, mode: "sea" }, new Date(NOW.getTime() + 60_000));
    expect([...db.state.sent].sort()).toEqual([...EVERY_ANSWER].sort());
    expect(db.state.sent).toHaveLength(23);
    expect(callsMade()).toEqual([]);
    expect(db.state.peak).toBe(5);
    expect(c.audit).toEqual({ days: 7, items: expect.any(Array) });
  });
});
