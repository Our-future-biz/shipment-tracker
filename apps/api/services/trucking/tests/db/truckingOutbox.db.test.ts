import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { truckingOutboxRepository } from "../../repositories/truckingOutbox.repository";
import { truckingOutboxTable, type NewTruckingOutboxRecord } from "../../schemas/truckingOutbox.schema";

// The trucking outbox against the trucking database: which rows are claimed, and "Send again".
// Runs only under `encore test` (TRUCKING_DB_TESTS=1 encore test services/trucking/tests/db); a
// plain `vitest run` skips it.

const o = truckingOutboxTable;

async function insert(companyId: string, shipmentId: string, over: Partial<NewTruckingOutboxRecord>) {
  const [row] = await db
    .insert(o)
    .values({
      companyId,
      consignmentId: randomUUID(),
      shipmentId,
      kind: "planned",
      payload: {},
      actingUserId: randomUUID(),
      actingRole: "user",
      nextAttemptAt: new Date(Date.now() - 1000),
      ...over,
    })
    .returning();
  return row!;
}

describe("claiming due job updates", () => {
  it("does not hold a job's later update back behind one that failed for good", async () => {
    const c = randomUUID();
    const s = randomUUID();
    await insert(c, s, { status: "failed", attempts: 15, createdAt: new Date(Date.now() - 60_000) });
    const later = await insert(c, s, {});
    const claimed = await truckingOutboxRepository.claimDue(10, later.consignmentId);
    expect(claimed.map((r) => r.id)).toEqual([later.id]);
  });

  it("still holds it back behind an older pending one of the same job", async () => {
    const c = randomUUID();
    const s = randomUUID();
    await insert(c, s, { createdAt: new Date(Date.now() - 60_000), nextAttemptAt: new Date(Date.now() + 3_600_000) });
    const later = await insert(c, s, {});
    expect(await truckingOutboxRepository.claimDue(10, later.consignmentId)).toEqual([]);
  });
});

describe("send again", () => {
  it("puts failed rows back to pending, due now, with a fresh count; a gone user's rows go out as the service identity", async () => {
    const c = randomUUID();
    const s = randomUUID();
    const stays = randomUUID();
    const svc = randomUUID();
    const a = await insert(c, s, { status: "failed", attempts: 15, lastError: "The update was refused", actingUserId: stays, actingRole: "manager", nextAttemptAt: new Date(Date.now() + 3_600_000) });
    const b = await insert(c, s, { status: "failed", attempts: 3, actingUserId: "", actingRole: "" });
    const failed = await truckingOutboxRepository.failedFor(c, [a.consignmentId, b.consignmentId]);
    expect(failed.map((r) => r.id)).toEqual([a.id, b.id]);
    const requeued = await truckingOutboxRepository.requeueFailed(c, [a.id, b.id], { gone: [""], userId: svc, role: "user" });
    expect(requeued).toHaveLength(2);
    const [ra] = await db.select().from(o).where(eq(o.id, a.id));
    const [rb] = await db.select().from(o).where(eq(o.id, b.id));
    expect(ra).toMatchObject({ status: "pending", attempts: 0, lastError: "", actingUserId: stays, actingRole: "manager" });
    expect(ra!.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(rb).toMatchObject({ status: "pending", attempts: 0, actingUserId: svc, actingRole: "user" });
    // Another company's ids are not touched.
    expect(await truckingOutboxRepository.requeueFailed(randomUUID(), [a.id], null)).toEqual([]);
  });

  it("reports failed rows and rows waiting too long for the warning", async () => {
    const c = randomUUID();
    const before = await truckingOutboxRepository.unsentHealth(10);
    const f = await insert(c, randomUUID(), { status: "failed" });
    await insert(c, randomUUID(), { createdAt: new Date(Date.now() - 30 * 60_000) });
    await insert(c, randomUUID(), {});
    const after = await truckingOutboxRepository.unsentHealth(10);
    expect(after.failed - before.failed).toBe(1);
    expect(after.stalePending - before.stalePending).toBe(1);
    const unsent = await truckingOutboxRepository.unsentFor(c, [f.consignmentId], 10);
    expect(unsent.map((r) => r.id)).toEqual([f.id]);
  });
});
