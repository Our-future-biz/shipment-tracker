import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const publish = vi.hoisted(() => vi.fn(async () => "msg"));
vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: { openInvoiceCount: async () => ({ count: 0 }) }, quotes: {}, warehouse: { _internalPickupPlates: async () => ({ plates: [] }) } }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));

import { db } from "../../db/db";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentEventOutboxTable } from "../../schemas/shipmentEventOutbox.schema";
import { shipmentTable } from "../../schemas/shipment.schema";
import { deliverShipmentEvents } from "../../services/shipmentEvents.service";

// The shipment-deleted event outbox against the shipments database (migration 0082). Runs only
// under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

let jobs = 700;
const newJob = async () => {
  const companyId = randomUUID();
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: `CZE${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight" })
    .returning();
  return { id: row!.id, companyId };
};
const outboxOf = (shipmentId: string) => db.select().from(shipmentEventOutboxTable).where(eq(shipmentEventOutboxTable.shipmentId, shipmentId));
const actor = { userId: randomUUID(), role: "manager" };

describe("shipment-deleted outbox", () => {
  it("writes the event with the delete and publishes it once", async () => {
    const s = await newJob();
    expect(await shipmentRepository.softDeleteWithEvent(s.id, s.companyId, actor)).toBe(true);
    const [owed] = await outboxOf(s.id);
    expect(owed).toMatchObject({ status: "pending", event: { shipmentId: s.id, companyId: s.companyId }, actingUserId: actor.userId });

    publish.mockClear();
    await deliverShipmentEvents(s.id);
    expect(publish).toHaveBeenCalledWith({ shipmentId: s.id, companyId: s.companyId });
    expect((await outboxOf(s.id))[0]).toMatchObject({ status: "sent" });
    // Delivered once: a later run has nothing of it left.
    publish.mockClear();
    await deliverShipmentEvents(s.id);
    expect(publish).not.toHaveBeenCalled();
  });

  it("keeps the event owed when the publish fails, and sends it on a later run", async () => {
    const s = await newJob();
    await shipmentRepository.softDeleteWithEvent(s.id, s.companyId, actor);
    publish.mockRejectedValueOnce(new Error("pubsub is down"));
    await deliverShipmentEvents(s.id);
    const [waiting] = await outboxOf(s.id);
    expect(waiting).toMatchObject({ status: "pending", attempts: 1 });
    // Due again (the retry waits a while; the test brings it forward).
    await db.update(shipmentEventOutboxTable).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(shipmentEventOutboxTable.id, waiting!.id));
    await deliverShipmentEvents(s.id);
    expect((await outboxOf(s.id))[0]).toMatchObject({ status: "sent" });
  });

  it("owes nothing for a shipment that was already deleted, or another company's", async () => {
    const s = await newJob();
    expect(await shipmentRepository.softDeleteWithEvent(s.id, randomUUID(), actor)).toBe(false);
    expect(await outboxOf(s.id)).toEqual([]);
    await shipmentRepository.softDeleteWithEvent(s.id, s.companyId, actor);
    expect(await shipmentRepository.softDeleteWithEvent(s.id, s.companyId, actor)).toBe(false);
    expect(await outboxOf(s.id)).toHaveLength(1);
  });
});
