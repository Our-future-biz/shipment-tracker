import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../db/db";
import { operationsFactsRepository } from "../../repositories/operationsFacts.repository";
import { truckingConsignmentTable, type NewTruckingConsignmentRecord } from "../../schemas/truckingConsignment.schema";
import { truckingExceptionTable, type NewTruckingExceptionRecord } from "../../schemas/avizace.schema";
import { truckingOutboxTable, type NewTruckingOutboxRecord } from "../../schemas/truckingOutbox.schema";

// The grouped reads of Shipments → Managers' Trucking facts against the trucking database. Runs only
// under `encore test` (TRUCKING_DB_TESTS=1 encore test services/trucking/tests/db); a plain `vitest run`
// skips it.

let seq = 900_000;

const stopOf = (kind: "PICKUP" | "DELIVERY") =>
  ({ id: kind, kind, siteId: null, name: "Alfa", street: "", postcode: "11000", city: "Praha", country: "CZ" }) as unknown as NewTruckingConsignmentRecord["pickup"];

async function consignment(companyId: string, shipmentId: string, over: Partial<NewTruckingConsignmentRecord> = {}) {
  const [row] = await db
    .insert(truckingConsignmentTable)
    .values({
      companyId,
      ref: `TCZ2026${String(++seq).padStart(6, "0")}`,
      shipmentId,
      customerId: randomUUID(),
      pickupDate: "2026-11-18",
      pickup: stopOf("PICKUP"),
      delivery: stopOf("DELIVERY"),
      load: { pieces: 1 } as NewTruckingConsignmentRecord["load"],
      ...over,
    })
    .returning();
  return row!;
}

async function exception(companyId: string, consignmentId: string, over: Partial<NewTruckingExceptionRecord> = {}) {
  const [row] = await db.insert(truckingExceptionTable).values({ companyId, consignmentId, kind: "DAMAGE", pieces: 1, ...over }).returning();
  return row!;
}

async function outbox(companyId: string, shipmentId: string, over: Partial<NewTruckingOutboxRecord> = {}) {
  await db.insert(truckingOutboxTable).values({ companyId, consignmentId: randomUUID(), shipmentId, kind: "planned", payload: {}, actingUserId: randomUUID(), actingRole: "user", ...over });
}

describe("the jobs' consignments", () => {
  it("of the company and the jobs asked, live, not cancelled and not Ready to bill", async () => {
    const company = randomUUID();
    const job = randomUUID();
    const open = await consignment(company, job);
    const podIn = await consignment(company, job, { status: "POD_RECEIVED", pickedUpAt: new Date(), deliveredAt: new Date(), podReceivedAt: new Date() });
    await consignment(company, job, { status: "READY_TO_BILL", pickedUpAt: new Date(), deliveredAt: new Date(), podReceivedAt: new Date(), readyToBillAt: new Date() });
    await consignment(company, job, { status: "CANCELLED", cancelledAt: new Date() });
    await consignment(company, job, { deletedAt: new Date() });
    await consignment(company, randomUUID());
    await consignment(randomUUID(), job);
    const rows = await operationsFactsRepository.consignmentsOf(company, [job]);
    expect(rows.map((r) => r.id).sort()).toEqual([open.id, podIn.id].sort());
    expect(await operationsFactsRepository.consignmentsOf(company, [])).toEqual([]);
  });
});

describe("the open delivery exceptions", () => {
  it("not closed, live, of the company's consignments asked", async () => {
    const company = randomUUID();
    const c = await consignment(company, randomUUID());
    const other = await consignment(company, randomUUID());
    const pending = await exception(company, c.id);
    const decided = await exception(company, c.id, { decision: "ABSORB", decidedAt: new Date() });
    await exception(company, c.id, { decision: "ABSORB", decidedAt: new Date(), closedAt: new Date() });
    await exception(company, c.id, { deletedAt: new Date() });
    await exception(company, other.id);
    const rows = await operationsFactsRepository.openExceptions(company, [c.id]);
    expect(rows.map((r) => r.id).sort()).toEqual([pending.id, decided.id].sort());
    expect(await operationsFactsRepository.openExceptions(randomUUID(), [c.id])).toEqual([]);
  });
});

describe("the updates to the jobs not delivered in time", () => {
  it("per job: pending longer than the limit, and failed; nothing sent, cancelled, fresh or another company's", async () => {
    const company = randomUUID();
    const a = randomUUID();
    const b = randomUUID();
    const old = new Date(Date.now() - 30 * 60_000);
    await outbox(company, a, { createdAt: old });
    await outbox(company, a, { createdAt: old });
    await outbox(company, a, {}); // pending, 0 min old
    await outbox(company, a, { status: "failed", attempts: 15 });
    await outbox(company, a, { status: "sent", sentAt: new Date(), createdAt: old });
    await outbox(company, a, { status: "cancelled", createdAt: old });
    await outbox(company, a, { status: "failed", deletedAt: new Date() });
    await outbox(company, b, { status: "failed" });
    await outbox(randomUUID(), a, { status: "failed" });
    const counts = await operationsFactsRepository.unsentCounts(company, [a, b, randomUUID()], 10);
    expect(Object.fromEntries(counts)).toEqual({ [a]: { waiting: 2, failed: 1 }, [b]: { waiting: 0, failed: 1 } });
  });
});
