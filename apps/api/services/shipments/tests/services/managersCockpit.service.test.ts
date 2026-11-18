import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ managersCockpitRows: vi.fn(), dateMovedLately: vi.fn(), trackingAttentionCandidates: vi.fn() }));
const events = vi.hoisted(() => ({ proposedOn: vi.fn(), latestPerShipment: vi.fn(), arrivedAtHub: vi.fn(), ofKinds: vi.fn() }));
const notices = vi.hoisted(() => ({ latestPerShipment: vi.fn() }));
const containers = vi.hoisted(() => ({ withFreeTime: vi.fn() }));
const users = vi.hoisted(() => ({ userEmails: vi.fn() }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: events }));
vi.mock("../../repositories/shipmentCustomerNotice.repository", () => ({ shipmentCustomerNoticeRepository: notices }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: containers }));
vi.mock("../../lib/userEmails", () => users);

import { COCKPIT_JOB_LIMIT } from "../../lib/cockpitThresholds";
import { managersCockpitService } from "../../services/managersCockpit.service";
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
  vgm: "",
  siClosing: null,
  shippingInstructions: "",
  ams: "",
  amsDeadline: null,
  isf: "",
  isfDeadline: null,
  customsPriority: "Standard",
  customsStatus: "",
  customsDeadline: "",
  bookingConfirmation: "Received",
  claim: "No",
  ...over,
});

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
  users.userEmails.mockResolvedValue(new Map([["u1", " Jan@Firma.cz "]]));
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
    expect(events.ofKinds).toHaveBeenLastCalledWith(kept, COMPANY, ["discharged", "terminal_out", "empty_returned"]);
  });

  it("judges everything on the one Prague day of `now`: the cut-offs and the boxes' free time alike", async () => {
    shipments.managersCockpitRows.mockResolvedValue([row(1, { closingDate: "2026-11-19" }), row(2)]);
    // A box whose last free day was the 17th: over by one day on the 18th, not over on the 17th.
    containers.withFreeTime.mockResolvedValue([{ shipmentId: "id-2", containerNumber: "AAAU1", freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: "2026-11-17" }]);
    const c = await managersCockpitService.cockpit(COMPANY, EVERYONE, NOW);
    expect(c.today).toBe("2026-11-18");
    expect(c.asOf).toBe("2026-11-17T23:30:00.000Z");
    expect(c.urgent.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.text)])).toEqual([
      ["CZFCL00000001", ["Closing tomorrow"]],
      ["CZFCL00000002", ["Free time over · AAAU1 1 d over"]],
    ]);
    expect(c.tiles).toMatchObject({ cutoffsDue: 1, freeTime: 1 });
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
