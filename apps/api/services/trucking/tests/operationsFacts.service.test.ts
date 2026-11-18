import { beforeEach, describe, expect, it, vi } from "vitest";

// Shipments → Managers, step 5: POST /internal/trucking/operations-facts against mocked repositories - the
// ids cleaned, each family read once for all the jobs, the company and user from the caller's auth (any role),
// the holidays read only when a consignment waits for its POD, and a family that fails named in `notKnown`
// with none of its issues or figures while the others still answer.
vi.mock("encore.dev/api", async () => ({ ...(await import("../../../lib/tests/encoreApi.stub")), api: (_opts: unknown, handler: unknown) => handler }));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: "user" }) }));
vi.mock("../db/db", () => ({ db: {}, inTx: vi.fn() }));
vi.mock("../services/truckingOutbox.service", () => ({ STALE_PENDING_MINUTES: 10 }));
vi.mock("../lib/czHolidays", () => ({ czHolidays: vi.fn(async () => [] as string[]) }));
vi.mock("../repositories/operationsFacts.repository", () => ({
  operationsFactsRepository: { consignmentsOf: vi.fn(), openExceptions: vi.fn(), unsentCounts: vi.fn() },
}));
vi.mock("../repositories/leg.repository", () => ({ legRepository: { forConsignments: vi.fn() } }));
vi.mock("../repositories/trip.repository", () => ({ tripRepository: { findMany: vi.fn() } }));

import { _internalTruckingOperationsFacts } from "../controllers/_internalOperationsFacts.controller";
import { operationsFactsService, TRUCKING_FACT_PARTS } from "../services/operationsFacts.service";
import { operationsFactsRepository } from "../repositories/operationsFacts.repository";
import { legRepository } from "../repositories/leg.repository";
import { tripRepository } from "../repositories/trip.repository";
import { czHolidays } from "../lib/czHolidays";
import type { TruckingConsignmentRecord, TruckingLegRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { TruckingExceptionRecord } from "../schemas/avizace.schema";

const S1 = "00000000-0000-4000-8000-0000000000a1";
const S2 = "00000000-0000-4000-8000-0000000000a2";
const S3 = "00000000-0000-4000-8000-0000000000a3";
/** Wed 18 Nov 2026, 09:00 Prague */
const NOW = new Date("2026-11-18T08:00:00Z");

const consignment = (over: Partial<TruckingConsignmentRecord>) =>
  ({
    scope: "FTL",
    status: "BOOKED",
    pickupDate: "2026-11-25",
    promisedDate: null,
    tripId: null,
    confirmedAt: null,
    deliveredAt: null,
    podReceivedAt: null,
    readyToBillAt: null,
    cancelledAt: null,
    createdAt: new Date("2026-11-10T09:00:00Z"),
    ...over,
  }) as TruckingConsignmentRecord;

// S1: an FTL ordered for today, not confirmed; an LTL booked for tomorrow with no trip. S2: delivered on
// Tue 10 Nov with no POD (5 working days); POD in with a damage not decided for 60 h.
const ordered = consignment({ id: "k1", ref: "TCZ2026000001", shipmentId: S1, status: "ORDERED", tripId: "t1", pickupDate: "2026-11-18" });
const ltl = consignment({ id: "k2", ref: "TCZ2026000002", shipmentId: S1, scope: "LTL", pickupDate: "2026-11-19" });
const delivered = consignment({ id: "k3", ref: "TCZ2026000003", shipmentId: S2, status: "DELIVERED", pickupDate: "2026-11-09", deliveredAt: new Date("2026-11-10T10:00:00Z") });
const podIn = consignment({ id: "k4", ref: "TCZ2026000004", shipmentId: S2, status: "POD_RECEIVED", pickupDate: "2026-11-02", deliveredAt: new Date("2026-11-03T10:00:00Z"), podReceivedAt: new Date("2026-11-04T10:00:00Z") });
const trip = { id: "t1", createdAt: new Date("2026-11-12T09:00:00Z"), orderSentAt: new Date("2026-11-16T10:00:00Z"), confirmedAt: null, rejectedAt: null, cancelledAt: null } as TruckingTripRecord;
const damage = { consignmentId: "k4", kind: "DAMAGE", failedReason: null, decision: "PENDING", description: "", waitingMinutes: null, createdAt: new Date(NOW.getTime() - 60 * 3_600_000), decidedAt: null, closedAt: null } as TruckingExceptionRecord;
const ltlLeg = { id: "l1", consignmentId: "k2", kind: "PICKUP", seq: 1, status: "OPEN", tripId: null } as TruckingLegRecord;

beforeEach(() => {
  vi.mocked(operationsFactsRepository.consignmentsOf).mockReset().mockResolvedValue([ordered, ltl, delivered, podIn]);
  vi.mocked(operationsFactsRepository.openExceptions).mockReset().mockResolvedValue([damage]);
  vi.mocked(operationsFactsRepository.unsentCounts).mockReset().mockResolvedValue(new Map([[S1, { waiting: 1, failed: 2 }]]));
  vi.mocked(legRepository.forConsignments).mockReset().mockResolvedValue([ltlLeg]);
  vi.mocked(tripRepository.findMany).mockReset().mockResolvedValue([trip]);
  vi.mocked(czHolidays).mockReset().mockResolvedValue([]);
});

const kinds = (f: Awaited<ReturnType<typeof operationsFactsService.forJobs>>) =>
  Object.fromEntries(f.shipments.flatMap((s) => s.consignments.map((c) => [c.ref, c.issues.map((i) => `${i.kind}${i.urgent ? "!" : ""}`)])));

describe("Trucking's facts for the operations cockpit", () => {
  it("reads each family once for all the jobs and judges by Trucking's rules", async () => {
    const facts = await operationsFactsService.forJobs("c1", "u1", [S1, ` ${S2.toUpperCase()} `, S1, "not-a-job", S3], NOW);
    expect(facts.notKnown).toEqual([]);
    expect(operationsFactsRepository.consignmentsOf).toHaveBeenCalledTimes(1);
    expect(operationsFactsRepository.consignmentsOf).toHaveBeenCalledWith("c1", [S1, S2, S3]);
    expect(operationsFactsRepository.unsentCounts).toHaveBeenCalledWith("c1", [S1, S2, S3], 10);
    expect(operationsFactsRepository.openExceptions).toHaveBeenCalledWith("c1", ["k1", "k2", "k3", "k4"]);
    expect(legRepository.forConsignments).toHaveBeenCalledWith("c1", ["k2"]);
    expect(tripRepository.findMany).toHaveBeenCalledWith("c1", ["t1"]);
    // One holidays call, named for the company and the caller, over the Consignments list's window.
    expect(czHolidays).toHaveBeenCalledTimes(1);
    expect(czHolidays).toHaveBeenCalledWith("c1", "2026-10-04", "2026-12-02", "u1");
    expect(facts).toMatchObject({ issuesRead: true, updatesRead: true });

    expect(facts.shipments.map((s) => s.shipmentId)).toEqual([S1, S2]);
    expect(facts.shipments[0]).toMatchObject({ updatesWaiting: 1, updatesFailed: 2 });
    expect(facts.shipments[1]).toMatchObject({ updatesWaiting: 0, updatesFailed: 0 });
    expect(kinds(facts)).toEqual({
      TCZ2026000001: ["haulier_not_confirmed!"],
      TCZ2026000002: ["no_haulier"],
      TCZ2026000003: ["pod_missing!"],
      TCZ2026000004: ["exception_open!"],
    });
    expect(facts.shipments[0]!.consignments[0]).toEqual({
      id: "k1",
      ref: "TCZ2026000001",
      status: "Ordered",
      pickupDate: "2026-11-18",
      deliveryDate: null,
      issues: [{ kind: "haulier_not_confirmed", text: "Ordered, not confirmed: pick-up today", urgent: true, since: "2026-11-16T10:00:00.000Z" }],
    });
  });

  it("a family that fails is named and gives none of its issues; the others still answer", async () => {
    vi.mocked(operationsFactsRepository.openExceptions).mockRejectedValue(new Error("connection reset"));
    const facts = await operationsFactsService.forJobs("c1", "u1", [S1, S2], NOW);
    expect(facts.notKnown).toEqual([TRUCKING_FACT_PARTS.exceptions]);
    expect(facts).toMatchObject({ issuesRead: false, updatesRead: true });
    // The consignment with its POD is not known to be in play any more; the rest is judged as before.
    expect(kinds(facts)).toEqual({ TCZ2026000001: ["haulier_not_confirmed!"], TCZ2026000002: ["no_haulier"], TCZ2026000003: ["pod_missing!"] });
  });

  it("the updates not read: their counts are null, not 0", async () => {
    vi.mocked(operationsFactsRepository.unsentCounts).mockRejectedValue(new Error("timeout"));
    const facts = await operationsFactsService.forJobs("c1", "u1", [S1, S2], NOW);
    expect(facts.notKnown).toEqual([TRUCKING_FACT_PARTS.updates]);
    // The caller can tell "no updates" from "not read" for the jobs left out too.
    expect(facts).toMatchObject({ issuesRead: true, updatesRead: false });
    expect(facts.shipments.map((s) => [s.updatesWaiting, s.updatesFailed])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it("the trips not read: no haulier or pick-up issues; the consignments not read: only the updates", async () => {
    vi.mocked(tripRepository.findMany).mockRejectedValue(new Error("timeout"));
    let facts = await operationsFactsService.forJobs("c1", "u1", [S1, S2], NOW);
    expect(facts.notKnown).toEqual([TRUCKING_FACT_PARTS.trips]);
    expect(facts).toMatchObject({ issuesRead: false, updatesRead: true });
    expect(kinds(facts)).toEqual({ TCZ2026000001: [], TCZ2026000002: [], TCZ2026000003: ["pod_missing!"], TCZ2026000004: ["exception_open!"] });

    vi.mocked(operationsFactsRepository.consignmentsOf).mockRejectedValue(new Error("timeout"));
    vi.mocked(operationsFactsRepository.openExceptions).mockClear();
    vi.mocked(tripRepository.findMany).mockClear();
    facts = await operationsFactsService.forJobs("c1", "u1", [S1, S2], NOW);
    expect(facts.notKnown).toEqual([TRUCKING_FACT_PARTS.consignments]);
    expect(operationsFactsRepository.openExceptions).not.toHaveBeenCalled();
    expect(tripRepository.findMany).not.toHaveBeenCalled();
    expect(facts.shipments).toEqual([{ shipmentId: S1, consignments: [], updatesWaiting: 1, updatesFailed: 2 }]);
    expect(facts).toMatchObject({ issuesRead: false, updatesRead: true });
  });

  it("the holidays: asked when a consignment waits for its haulier or its POD, else not; not read → statutory only, and said", async () => {
    const onTheRoad = consignment({ id: "k5", ref: "TCZ2026000005", shipmentId: S1, status: "PICKED_UP", tripId: "t1", pickupDate: "2026-11-17" });
    vi.mocked(operationsFactsRepository.consignmentsOf).mockResolvedValue([onTheRoad, podIn]);
    await operationsFactsService.forJobs("c1", "u1", [S1, S2], NOW);
    expect(czHolidays).not.toHaveBeenCalled();
    vi.mocked(operationsFactsRepository.consignmentsOf).mockResolvedValue([ltl]);
    await operationsFactsService.forJobs("c1", "u1", [S1], NOW);
    expect(czHolidays).toHaveBeenCalledTimes(1);

    vi.mocked(operationsFactsRepository.consignmentsOf).mockResolvedValue([delivered]);
    vi.mocked(czHolidays).mockRejectedValue(new Error("holidays down"));
    const facts = await operationsFactsService.forJobs("c1", "u1", [S2], NOW);
    expect(facts.notKnown).toEqual([TRUCKING_FACT_PARTS.holidays]);
    expect(TRUCKING_FACT_PARTS.holidays).toBe("the company's holidays (counting only the statutory ones)");
    // The holidays are not one of the issue families.
    expect(facts).toMatchObject({ issuesRead: true, updatesRead: true });
    expect(kinds(facts)).toEqual({ TCZ2026000003: ["pod_missing!"] });
  });

  it("asks nothing for no usable id", async () => {
    expect(await operationsFactsService.forJobs("c1", "u1", ["", "nope"], NOW)).toEqual({ shipments: [], notKnown: [], issuesRead: true, updatesRead: true });
    expect(operationsFactsRepository.consignmentsOf).not.toHaveBeenCalled();
    expect(operationsFactsRepository.unsentCounts).not.toHaveBeenCalled();
  });

  it("the endpoint takes the company and the user from the caller's auth, a plain user included", async () => {
    const facts = await (_internalTruckingOperationsFacts as unknown as (req: { shipmentIds: string[] }) => ReturnType<typeof operationsFactsService.forJobs>)({ shipmentIds: [S1] });
    expect(operationsFactsRepository.consignmentsOf).toHaveBeenCalledWith("c1", [S1]);
    expect(facts.shipments.map((s) => s.shipmentId)).toEqual([S1]);
  });
});
