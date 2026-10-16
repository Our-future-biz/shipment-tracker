import { beforeEach, describe, expect, it, vi } from "vitest";

// "Not sent — Send again" and the warning about failed or long-waiting job updates.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ shipments: {}, invoicing: {}, auth: {} }));
vi.mock("../db/db", () => ({ db: { fake: "db" } }));
const { outbox, consignments, legs, trips } = vi.hoisted(() => ({
  outbox: { failedFor: vi.fn(), unsentFor: vi.fn(), unsentHealth: vi.fn(), claimDue: vi.fn(async () => []) },
  consignments: { find: vi.fn(), findMany: vi.fn(), findByTrips: vi.fn() },
  legs: { forTrips: vi.fn() },
  trips: { find: vi.fn() },
}));
vi.mock("../repositories/truckingOutbox.repository", () => ({ truckingOutboxRepository: outbox }));
vi.mock("../repositories/consignment.repository", () => ({ consignmentRepository: consignments }));
vi.mock("../repositories/leg.repository", () => ({ legRepository: legs }));
vi.mock("../repositories/trip.repository", () => ({ tripRepository: trips }));
vi.mock("../repositories/event.repository", () => ({ appendEvent: vi.fn() }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));
vi.mock("../../../lib/outbox/sendAgain", () => ({ sendFailedAgain: vi.fn(async (_repo: unknown, _c: string, rows: unknown[]) => rows) }));

import log from "encore.dev/log";
import { appendEvent } from "../repositories/event.repository";
import { sendFailedAgain } from "../../../lib/outbox/sendAgain";
import { failedUpdates, sendAgain } from "../services/truckingSendAgain.service";
import { addUnsentReasons, unsentReasonsOf, warnStaleOutbox } from "../services/truckingOutbox.service";
import type { TruckingOutboxRecord } from "../schemas/truckingOutbox.schema";

const C = "00000000-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-000000000002";
const C1 = "00000000-0000-0000-0000-0000000000c1";
const C2 = "00000000-0000-0000-0000-0000000000c2";
const TRIP = "00000000-0000-0000-0000-0000000000f1";
const manager = { userID: U, companyID: C, role: "manager" };
const user = { ...manager, role: "user" };

const failed = (id: string, consignmentId: string, kind: TruckingOutboxRecord["kind"]) =>
  ({ id, companyId: C, consignmentId, shipmentId: "s1", kind, status: "failed", attempts: 15, lastError: "The update was refused", createdAt: new Date("2026-10-15T08:00:00Z"), actingUserId: "" }) as TruckingOutboxRecord;

beforeEach(() => {
  vi.clearAllMocks();
  consignments.find.mockResolvedValue({ id: C1 });
  consignments.findMany.mockResolvedValue([
    { id: C1, ref: "FTL2026-0001", jobNumber: "CZ00000001" },
    { id: C2, ref: "LTL2026-0002", jobNumber: "CZ00000002" },
  ]);
  consignments.findByTrips.mockResolvedValue([{ id: C1 }]);
  legs.forTrips.mockResolvedValue([{ consignmentId: C2 }, { consignmentId: C1 }]);
  trips.find.mockResolvedValue({ id: TRIP });
});

describe("failed job updates", () => {
  it("are for managers only", async () => {
    await expect(failedUpdates(user, { consignmentId: C1 })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(sendAgain(user, { consignmentId: C1 })).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("are listed with the consignment and job, for a trip from its consignments and their legs", async () => {
    outbox.failedFor.mockResolvedValue([failed("o1", C2, "costs")]);
    const items = await failedUpdates(manager, { tripId: TRIP });
    expect(outbox.failedFor).toHaveBeenCalledWith(C, [C1, C2]);
    expect(items).toEqual([
      expect.objectContaining({ id: "o1", consignmentRef: "LTL2026-0002", jobNumber: "CZ00000002", what: "Trucking lines in Costs Breakdown", state: "failed", attempts: 15 }),
    ]);
    trips.find.mockResolvedValue(null);
    await expect(failedUpdates(manager, { tripId: TRIP })).rejects.toMatchObject({ code: "not_found" });
  });

  it("are sent again: requeued (gone users as the service identity), logged on each consignment, delivered", async () => {
    const rows = [failed("o1", C1, "planned"), failed("o2", C1, "costs"), failed("o3", C2, "billing")];
    outbox.failedFor.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
    const res = await sendAgain(manager, { tripId: TRIP });
    expect(sendFailedAgain).toHaveBeenCalledWith(outbox, C, rows);
    expect(res).toEqual({ requeued: 3, unsent: [] });
    expect(vi.mocked(appendEvent).mock.calls.map((c) => c[2])).toEqual([
      expect.objectContaining({ kind: "outbox_sent_again", consignmentId: C1, tripId: TRIP, byUserId: U, byName: "Jana Nováková", payload: expect.objectContaining({ summary: "Sent again: pick-up and planned delivery date, Trucking lines in Costs Breakdown" }) }),
      expect.objectContaining({ kind: "outbox_sent_again", consignmentId: C2, payload: expect.objectContaining({ summary: "Sent again: Shipment Status Billing" }) }),
    ]);
    // Each consignment's rows are sent straight away.
    expect(outbox.claimDue).toHaveBeenCalledWith(20, C1);
    expect(outbox.claimDue).toHaveBeenCalledWith(20, C2);
  });

  it("refuses when nothing failed", async () => {
    outbox.failedFor.mockResolvedValue([]);
    await expect(sendAgain(manager, { consignmentId: C1 })).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(sendAgain(manager, {})).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("needs attention", () => {
  it("names what failed (send again) or still waits", () => {
    const reasons = unsentReasonsOf([
      { consignmentId: C1, kind: "costs", status: "failed" },
      { consignmentId: C1, kind: "planned", status: "pending" },
      { consignmentId: C2, kind: "billing", status: "pending" },
    ]);
    expect(reasons.get(C1)).toBe("Not sent to the job: Trucking lines in Costs Breakdown — a manager can send it again");
    expect(reasons.get(C2)).toBe("Not sent to the job yet: Shipment Status Billing (retrying)");
  });

  it("is added to the listed consignments", async () => {
    outbox.unsentFor.mockResolvedValue([{ consignmentId: C2, kind: "costs", status: "failed" }]);
    const items = await addUnsentReasons(C, [
      { id: C1, needsAttention: [] },
      { id: C2, needsAttention: ["Negative margin"] },
    ]);
    expect(outbox.unsentFor).toHaveBeenCalledWith(C, [C1, C2], 10);
    expect(items[0]!.needsAttention).toEqual([]);
    expect(items[1]!.needsAttention).toEqual(["Negative margin", "Not sent to the job: Trucking lines in Costs Breakdown — a manager can send it again"]);
  });

  it("is warned about: failed rows and rows waiting too long", async () => {
    outbox.unsentHealth.mockResolvedValue({ failed: 2, stalePending: 1, oldestPending: "2026-10-15T08:00:00.000Z" });
    expect(await warnStaleOutbox()).toBe(3);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("failed for good"), { failed: 2 });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("waiting longer"), expect.objectContaining({ count: 1 }));
  });
});
