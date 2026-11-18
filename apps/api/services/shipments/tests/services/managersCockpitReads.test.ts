import { beforeEach, describe, expect, it, vi } from "vitest";

// One answer of Shipments → Managers from end to end - the cockpit's service and every reader it
// calls (Needs Attention's facts, the other tables' signals, the people around the jobs, the
// dismissed cut-offs, the audit line) as they are - against stand-ins for the repositories only:
// each of their methods is a statement that holds a connection for a moment. How many statements
// an answer sends, and that it never holds more than five of the pool's ten at once.
const db = vi.hoisted(() => {
  const state = { running: 0, peak: 0, sent: [] as string[] };
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
          return answers[method] ? answers[method]!() : [];
        },
      },
    );
  return { state, repository, jobs: [] as unknown[] };
});
const clients = vi.hoisted(() => ({ auth: { usersList: vi.fn() }, holidays: { _internalHolidaysCzNational: vi.fn() } }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => clients);
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: db.repository("shipment", { managersCockpitRows: () => db.jobs, jobNumbersByIds: () => new Map() }) }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: db.repository("event", { latestPerShipment: () => new Map(), arrivedAtHub: () => new Set() }) }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: db.repository("notice", { latestPerShipment: () => new Map() }) }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: db.repository("container") }));
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
vi.mock("../../repositories/shipmentCutoffDismissal.repository", () => ({ shipmentCutoffDismissalRepository: db.repository("dismissal") }));

import { COCKPIT_READS_AT_ONCE } from "../../lib/cockpitThresholds";
import { managersCockpitService } from "../../services/managersCockpit.service";
import { forgetAuditLines } from "../../services/managersCockpitAudit.service";

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

beforeEach(() => {
  forgetAuditLines();
  db.state.running = 0;
  db.state.peak = 0;
  db.state.sent.length = 0;
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
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);

    expect(COCKPIT_READS_AT_ONCE).toBe(5);
    expect(db.state.peak).toBe(5);
    expect([...db.state.sent].sort()).toEqual([...EVERY_ANSWER, ...AUDIT_LINE].sort());
    expect(db.state.sent).toHaveLength(28);
    // And it is a whole answer: everything was read.
    expect(c).toMatchObject({ tiles: { active: 3 }, notKnown: [], holidaysKnown: true, audit: { days: 7 } });
    expect(c.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["VGM overdue 2 days"]]);
    expect(c.people.map((p) => [p.handledBy, p.active, p.covers])).toEqual([
      ["jan@firma.cz", 3, 0],
      ["eva@firma.cz", 0, 1],
    ]);
  });

  it("sends six statements fewer while the company's audit line is kept: 22, and still five at once", async () => {
    await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    db.state.sent.length = 0;
    db.state.peak = 0;
    const c = await managersCockpitService.cockpit(COMPANY, { ...EVERYONE, mode: "sea" }, new Date(NOW.getTime() + 60_000));
    expect([...db.state.sent].sort()).toEqual([...EVERY_ANSWER].sort());
    expect(db.state.sent).toHaveLength(22);
    expect(db.state.peak).toBe(5);
    expect(c.audit).toEqual({ days: 7, items: expect.any(Array) });
  });
});
