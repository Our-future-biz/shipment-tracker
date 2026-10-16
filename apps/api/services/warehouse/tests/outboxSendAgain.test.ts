import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { deliverDue, MAX_ATTEMPTS, STALE_PENDING_MINUTES, warnStaleOutbox } from "../services/shipmentOutbox.service";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { gateEventOutboxRepository } from "../repositories/gateEventOutbox.repository";
import { deliverGateEvents, GATE_EVENT_FAILED } from "../services/gateEvents.service";
import { gateSendAgain, gateUnsent, SENT_AGAIN_EVENT } from "../services/gateSendAgain.service";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";
import { gateEventOutboxTable } from "../schemas/gateEventOutbox.schema";
import type { WarehouseGateStampedEvent } from "../topics";

// The two warehouse outboxes (shipment updates and the gate events for Trucking): a row that
// failed for good no longer holds the later ones back, is shown on the record, warned about, and a
// manager can send it again (a gone user's update then goes out as the service identity).

const SERVICE_USER = randomUUID();
const { publish, shipmentUpdate, gone } = vi.hoisted(() => ({
  publish: vi.fn(async (_e: unknown) => "msg"),
  shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})),
  gone: new Set<string>(),
}));
vi.mock("../topics", () => ({ warehouseGateStamped: { publish } }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: {
      usersList: vi.fn(async () => ({ users: [] })),
      userLookup: vi.fn(async ({ ids }: { ids: string[] }) => ({ users: ids.filter((id) => !gone.has(id)).map((id) => ({ id, name: "", role: "user" })) })),
      _internalServiceUser: vi.fn(async () => ({ userId: SERVICE_USER })),
    },
  };
});

const user = randomUUID();
const so = shipmentOutboxTable;
const eo = gateEventOutboxTable;
const past = (ms: number) => new Date(Date.now() - ms);

async function record(c: string) {
  return gateMovementService.create(c, user, { gateRef: `T-${randomUUID().slice(0, 8)}` });
}

async function owesShipment(c: string, movementId: string, shipmentId: string, over: Partial<typeof so.$inferInsert> = {}) {
  const [row] = await db
    .insert(so)
    .values({ companyId: c, movementId, shipmentId, kind: "plate", stamp: "", payload: { plate: "1AB 2345" }, actingUserId: user, actingRole: "user", nextAttemptAt: past(1000), ...over })
    .returning();
  return row!;
}

const gateEvent = (c: string, kind: WarehouseGateStampedEvent["kind"]): WarehouseGateStampedEvent => ({
  companyId: c,
  shipmentId: randomUUID(),
  positionId: randomUUID(),
  wczRef: "",
  kind,
  stampKind: kind,
  at: new Date().toISOString(),
  userId: user,
});

async function owesEvent(c: string, movementId: string, kind: WarehouseGateStampedEvent["kind"], over: Partial<typeof eo.$inferInsert> = {}) {
  const [row] = await db
    .insert(eo)
    .values({ companyId: c, movementId, event: gateEvent(c, kind), actingUserId: user, actingRole: "user", nextAttemptAt: past(1000), ...over })
    .returning();
  return row!;
}

beforeEach(() => {
  gone.clear();
  publish.mockReset();
  publish.mockImplementation(async () => "msg");
  shipmentUpdate.mockReset();
  shipmentUpdate.mockImplementation(async () => ({}));
});

describe("a row that failed for good", () => {
  it("does not hold back a later shipment update of the same shipment", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    await owesShipment(c, (await record(c)).id, shipmentId, { status: "failed", attempts: MAX_ATTEMPTS, createdAt: past(60_000) });
    const later = await record(c);
    await owesShipment(c, later.id, shipmentId, { payload: { plate: "2CD 3456" } });
    await deliverDue(later.id);
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(shipmentUpdate.mock.calls[0]![0]).toMatchObject({ shipmentId, plate: "2CD 3456" });
  });

  it("does not hold back the record's later gate events", async () => {
    const c = randomUUID();
    const m = await record(c);
    await owesEvent(c, m.id, "gateIn", { status: "failed", attempts: MAX_ATTEMPTS, createdAt: past(60_000) });
    await owesEvent(c, m.id, "gateOut");
    await deliverGateEvents(m.id);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0]).toMatchObject({ kind: "gateOut" });
  });

  it("a gate event that cannot be published for good is shown in the record's history", async () => {
    const c = randomUUID();
    const m = await record(c);
    await owesEvent(c, m.id, "gateIn", { attempts: MAX_ATTEMPTS - 1 });
    publish.mockRejectedValue(new Error("topic down"));
    await deliverGateEvents(m.id);
    const [row] = await db.select().from(eo).where(eq(eo.movementId, m.id));
    expect(row).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, lastError: "The gate event could not be published" });
    expect((await gateMovementService.get(m.id, c)).events.at(-1)).toMatchObject({ kind: GATE_EVENT_FAILED, label: "Not sent to Trucking: gate-in", by: "Warehouse" });
  });

  it("is warned about, in both outboxes", async () => {
    // Counted over all companies (other tests write rows meanwhile), so the counts are given here.
    const a = vi.spyOn(shipmentOutboxRepository, "unsentHealth").mockResolvedValueOnce({ failed: 1, stalePending: 1, oldestPending: past(30 * 60_000).toISOString() });
    const b = vi.spyOn(gateEventOutboxRepository, "unsentHealth").mockResolvedValueOnce({ failed: 2, stalePending: 0, oldestPending: null });
    expect(await warnStaleOutbox()).toBe(4);
    expect(a).toHaveBeenCalledWith(STALE_PENDING_MINUTES);
    expect(b).toHaveBeenCalledWith(STALE_PENDING_MINUTES);
  });
});

describe("Not sent — Send again", () => {
  it("is for managers only", async () => {
    const c = randomUUID();
    const m = await record(c);
    await expect(gateUnsent(m.id, c, "user")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(gateSendAgain(m.id, c, user, "user")).rejects.toMatchObject({ code: "permission_denied" });
    expect(await gateUnsent(m.id, c, "manager")).toBeNull();
    await expect(gateSendAgain(m.id, c, user, "manager")).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("sends the record's failed shipment updates and gate events again, logged; a gone user's update as the service identity", async () => {
    const c = randomUUID();
    const m = await record(c);
    const shipmentId = randomUUID();
    const leaver = randomUUID();
    gone.add(leaver);
    await owesShipment(c, m.id, shipmentId, { status: "failed", attempts: MAX_ATTEMPTS, lastError: "The user who stamped may no longer change this shipment", actingUserId: leaver, actingRole: "manager" });
    await owesEvent(c, m.id, "gateIn", { status: "failed", attempts: MAX_ATTEMPTS, lastError: "The gate event could not be published", updatedAt: past(5000) });
    expect(await gateUnsent(m.id, c, "manager")).toEqual({
      shipmentUpdates: ["plate number"],
      gateEvents: ["gate-in"],
      lastError: "The user who stamped may no longer change this shipment",
    });

    const res = await gateSendAgain(m.id, c, user, "manager");
    expect(res.unsent).toBeNull();
    expect(shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ shipmentId, plate: "1AB 2345" }), { authData: { userID: SERVICE_USER, companyID: c, role: "user" } });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ kind: "gateIn" }));
    expect(res.movement.events.find((e) => e.kind === SENT_AGAIN_EVENT)).toMatchObject({ label: "Not sent — sent again: plate number, gate-in" });
    expect(await db.select().from(so).where(and(eq(so.movementId, m.id), eq(so.status, "sent")))).toHaveLength(1);
    expect(await db.select().from(eo).where(and(eq(eo.movementId, m.id), eq(eo.status, "sent")))).toHaveLength(1);
  });

  it("reports what still failed afterwards", async () => {
    const c = randomUUID();
    const m = await record(c);
    await owesShipment(c, m.id, randomUUID(), { status: "failed" });
    shipmentUpdate.mockRejectedValue(Object.assign(new Error("gone"), { code: "not_found" }));
    const res = await gateSendAgain(m.id, c, user, "manager");
    expect(res.unsent).toMatchObject({ shipmentUpdates: ["plate number"], gateEvents: [], lastError: "The shipment no longer exists in Shipments" });
  });
});
