import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { truckingExpectService as svc, type ExpectArrivalInput } from "../services/truckingExpect.service";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { warehouseService } from "../services/warehouse.service";
import { warehouseRecordsService } from "../services/warehouseRecords.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseDockSlotTable } from "../schemas/warehouseRecords.schema";
import { gateEventOutboxTable } from "../schemas/gateEventOutbox.schema";
import { readPickup } from "../services/pickupPin";

// Trucking's trips through our warehouse: the internal expect-arrival / expect-departure /
// cancel-expected calls, and the warehouse-gate-stamped events the gate publishes after commit.

const { publish, shipmentUpdate } = vi.hoisted(() => ({
  publish: vi.fn(async (_e: unknown) => "msg"),
  shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})),
}));
vi.mock("../topics", () => ({ warehouseGateStamped: { publish } }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
// Thursday 15 Oct 2026, 10:00 in Prague (summer time) — the docks work 06:00–19:00 Mon–Fri.
const AT = "2026-10-15T08:00:00.000Z";
const ds = warehouseDockSlotTable;

const arrival = (shipmentId: string, extra: Partial<ExpectArrivalInput> = {}): ExpectArrivalInput => ({
  shipmentId,
  tripRef: "LCZ26-0001",
  tripKind: "PICKUP_RUN",
  haulierName: "Rapid Trans s.r.o.",
  plate: "1AB 2345",
  driver: "Jan Novák",
  driverPhone: "+420 777 111 222",
  expectedAt: AT,
  pieces: 4,
  weightKg: 1250.5,
  cbm: 3.2,
  ...extra,
});

const slotsOf = (movementId: string) => db.select().from(ds).where(eq(ds.movementId, movementId));
const liveSlots = async (movementId: string) => (await slotsOf(movementId)).filter((s) => s.status !== "Cancelled" && !s.deletedAt);

describe("expect-arrival", () => {
  it("makes the position once, fills the IN leg from the trip and books one dock slot (idempotent)", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const [a, b] = [await svc.expectArrival(c, user, arrival(shipmentId)), await svc.expectArrival(c, user, arrival(shipmentId))];
    expect(b).toEqual(a);
    expect(a.wczRef).toMatch(/^WCZ/);
    expect(a.dockSlotId).not.toBeNull();
    expect(await warehouseTaskRepository.listByShipmentId(shipmentId, c)).toHaveLength(1);

    const m = await gateMovementService.get(a.gateMovementId, c);
    expect(m.transportLegs.find((l) => l.leg === "IN")).toEqual({
      leg: "IN",
      company: "Rapid Trans s.r.o.",
      plate: "1AB 2345",
      driver: "Jan Novák",
      phone: "+420 777 111 222",
      gateTime: AT,
      source: { kind: "trucking", tripRef: "LCZ26-0001" },
    });
    // Blank gate figures take the trip's; nothing is stamped.
    expect(m).toMatchObject({ colli: 4, weightKg: 1250.5, measureCbm: 3.2, gateIn: null, gateOut: null, status: "Expected" });
    // One slot, at the expected time, shown on the gate job (Expected today reads it).
    expect(await liveSlots(a.gateMovementId)).toHaveLength(1);
    expect(m.dockSlots).toEqual([expect.objectContaining({ id: a.dockSlotId, date: "2026-10-15", time: "10:00", direction: "IN", tripRef: "LCZ26-0001" })]);
    // One "expected" event, not one per call.
    expect(m.events.filter((e) => e.kind === "expectedFromTrip")).toHaveLength(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it("runs twice at once and still makes one position and one slot", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const results = await Promise.all([svc.expectArrival(c, user, arrival(shipmentId)), svc.expectArrival(c, user, arrival(shipmentId))]);
    expect(results[0]!.gateMovementId).toBe(results[1]!.gateMovementId);
    expect(await warehouseTaskRepository.listByShipmentId(shipmentId, c)).toHaveLength(1);
    expect(await liveSlots(results[0]!.gateMovementId)).toHaveLength(1);
  });

  it("moves the slot when the trip is expected at another time", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const a = await svc.expectArrival(c, user, arrival(shipmentId));
    const b = await svc.expectArrival(c, user, arrival(shipmentId, { expectedAt: "2026-10-15T11:00:00.000Z" }));
    expect(b.dockSlotId).not.toBe(a.dockSlotId);
    const live = await liveSlots(a.gateMovementId);
    expect(live.map((s) => s.time)).toEqual(["13:00"]);
  });

  it("books no slot when every dock is taken then — null, logged, the leg still filled", async () => {
    const c = randomUUID();
    const other = await gateMovementService.create(c, user, { gateRef: "OTHER", visit: "příjem" });
    for (const dock of ["Dock 1", "Dock 2", "Dock 3", "Dock 4"]) {
      await warehouseRecordsService.createDockSlot(c, { movementId: other.id, date: "2026-10-15", time: "09:30", durationMin: 120, dock });
    }
    const shipmentId = randomUUID();
    const r = await svc.expectArrival(c, user, arrival(shipmentId));
    expect(r.dockSlotId).toBeNull();
    expect(await liveSlots(r.gateMovementId)).toEqual([]);
    const m = await gateMovementService.get(r.gateMovementId, c);
    expect(m.transportLegs.find((l) => l.leg === "IN")?.source).toEqual({ kind: "trucking", tripRef: "LCZ26-0001" });
  });

  it("books no slot outside the dock hours", async () => {
    const c = randomUUID();
    // Saturday.
    const r = await svc.expectArrival(c, user, arrival(randomUUID(), { expectedAt: "2026-10-17T08:00:00.000Z" }));
    expect(r.dockSlotId).toBeNull();
  });

  it("refuses a bad shipment id, trip ref or time", async () => {
    const c = randomUUID();
    await expect(svc.expectArrival(c, user, arrival("nope"))).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(svc.expectArrival(c, user, arrival(randomUUID(), { tripRef: " " }))).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(svc.expectArrival(c, user, arrival(randomUUID(), { expectedAt: "tomorrow" }))).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("trip legs and pick-up rows are read-only for people", () => {
  it("keeps a trip's leg when the gate saves the legs, and drops a marker sent by a client", async () => {
    const c = randomUUID();
    const r = await svc.expectArrival(c, user, arrival(randomUUID()));
    const m = await gateMovementService.get(r.gateMovementId, c);
    const edited = m.transportLegs.map((l) =>
      l.leg === "IN" ? { ...l, company: "Someone else", source: null } : l.leg === "OUT" ? { ...l, company: "Own truck", source: { kind: "trucking" as const, tripRef: "FAKE" } } : l,
    );
    const after = await gateMovementService.update(r.gateMovementId, c, user, { transportLegs: edited });
    expect(after.transportLegs.find((l) => l.leg === "IN")).toMatchObject({ company: "Rapid Trans s.r.o.", source: { tripRef: "LCZ26-0001" } });
    const out = after.transportLegs.find((l) => l.leg === "OUT")!;
    expect(out.company).toBe("Own truck");
    expect(out.source).toBeUndefined();
  });

  it("expect-departure fills the OUT leg and the pick-up row; a Shipments save keeps the trip row", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    await warehouseService.upsertPickupRows(shipmentId, c, { rows: JSON.stringify([{ haulier: "Typed", licensePlate: "9Z9 9999", driver: "" }]) });
    const dep = { ...arrival(shipmentId), tripRef: "LCZ26-0002", tripKind: "LINEHAUL" };
    await svc.expectDeparture(c, user, dep);
    await svc.expectDeparture(c, user, dep);
    const rows = readPickup((await warehouseSectionRepository.findPickup(shipmentId, c))?.data).rows;
    expect(rows).toEqual([
      { haulier: "Rapid Trans s.r.o.", licensePlate: "1AB 2345", driver: "Jan Novák", source: { kind: "trucking", tripRef: "LCZ26-0002" } },
      { haulier: "Typed", licensePlate: "9Z9 9999", driver: "" },
    ]);
    // The page sends the trip row back (edited) and its own rows: the trip row stays as stored.
    await warehouseService.upsertPickupRows(shipmentId, c, {
      rows: JSON.stringify([{ ...rows[0], haulier: "Changed" }, { haulier: "Typed 2", licensePlate: "", driver: "" }]),
    });
    const saved = readPickup((await warehouseSectionRepository.findPickup(shipmentId, c))?.data).rows;
    expect(saved).toEqual([rows[0], { haulier: "Typed 2", licensePlate: "", driver: "" }]);

    const task = (await warehouseTaskRepository.listByShipmentId(shipmentId, c))[0]!;
    const movementId = (await gateMovementRepository.liveIdForTask(task.id, c))!;
    const m = await gateMovementService.get(movementId, c);
    expect(m.transportLegs.find((l) => l.leg === "OUT")?.source).toEqual({ kind: "trucking", tripRef: "LCZ26-0002" });
    expect((await liveSlots(movementId)).filter((s) => s.direction === "OUT")).toHaveLength(1);
  });
});

describe("cancel-expected", () => {
  it("clears only what the trip set and removes a position made for it and never stamped", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const r = await svc.expectArrival(c, user, arrival(shipmentId));
    // Another trip's departure on the same position stays.
    await svc.expectDeparture(c, user, { ...arrival(shipmentId), tripRef: "LCZ26-0009" });
    await svc.cancelExpected(c, user, { shipmentId, tripRef: "LCZ26-0001" });
    const m = await gateMovementService.get(r.gateMovementId, c);
    expect(m.transportLegs.find((l) => l.leg === "IN")).toEqual({ leg: "IN", company: "", plate: "", driver: "", phone: "", gateTime: "" });
    expect(m.transportLegs.find((l) => l.leg === "OUT")?.source).toEqual({ kind: "trucking", tripRef: "LCZ26-0009" });
    expect((await liveSlots(r.gateMovementId)).map((s) => s.tripRef)).toEqual(["LCZ26-0009"]);
    expect(m.archivedAt).toBeNull();

    // The second trip goes too: nothing holds the position made for the first one any more.
    await svc.cancelExpected(c, user, { shipmentId, tripRef: "LCZ26-0009" });
    await svc.cancelExpected(c, user, { shipmentId, tripRef: "LCZ26-0001" });
    expect(await warehouseTaskRepository.findLiveForShipment(c, shipmentId)).toBeNull();
    expect((await gateMovementService.get(r.gateMovementId, c)).archivedAt).not.toBeNull();
    expect(readPickup((await warehouseSectionRepository.findPickup(shipmentId, c))?.data).rows).toEqual([]);
  });

  it("never clears or removes a stamped position", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const r = await svc.expectArrival(c, user, arrival(shipmentId));
    await gateMovementService.stamp(r.gateMovementId, c, user, "gateIn");
    await svc.cancelExpected(c, user, { shipmentId, tripRef: "LCZ26-0001" });
    const m = await gateMovementService.get(r.gateMovementId, c);
    expect(m.archivedAt).toBeNull();
    expect(m.gateIn).not.toBeNull();
    // What arrived stays as it arrived.
    expect(m.transportLegs.find((l) => l.leg === "IN")).toMatchObject({ company: "Rapid Trans s.r.o.", source: { tripRef: "LCZ26-0001" } });
    expect(await warehouseTaskRepository.findLiveForShipment(c, shipmentId)).not.toBeNull();
  });

  it("keeps a position that existed before the trip", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const { warehouseImportService } = await import("../services/warehouseImport.service");
    const [imported] = await warehouseImportService.importShipments(c, user, [shipmentId]);
    const r = await svc.expectArrival(c, user, arrival(shipmentId));
    expect(r.gateMovementId).toBe(imported!.movementId);
    await svc.cancelExpected(c, user, { shipmentId, tripRef: "LCZ26-0001" });
    expect(await warehouseTaskRepository.findLiveForShipment(c, shipmentId)).not.toBeNull();
    expect(await liveSlots(r.gateMovementId)).toEqual([]);
  });

  it("is a no-op for a shipment that has no position", async () => {
    await expect(svc.cancelExpected(randomUUID(), user, { shipmentId: randomUUID(), tripRef: "LCZ26-0001" })).resolves.toEqual({ ok: true });
  });
});

describe("warehouse-gate-stamped is published after commit", () => {
  beforeEach(() => {
    publish.mockReset();
    publish.mockImplementation(async () => "msg");
  });

  const eventsOf = (movementId: string) => db.select().from(gateEventOutboxTable).where(eq(gateEventOutboxTable.movementId, movementId));

  async function inbound() {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const r = await svc.expectArrival(c, user, arrival(shipmentId));
    // Trucking's hub cargo arrives: an inbound (příjem) position.
    await gateMovementRepository.update(r.gateMovementId, c, { visit: "příjem", handling: "Export" });
    return { c, shipmentId, ...r };
  }

  it("publishes gateIn once per stamp, even when ten clerks stamp together", async () => {
    const { c, shipmentId, gateMovementId, positionId, wczRef } = await inbound();
    await Promise.allSettled(Array.from({ length: 10 }, () => gateMovementService.stamp(gateMovementId, c, user, "gateIn")));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      companyId: c,
      shipmentId,
      positionId,
      wczRef,
      kind: "gateIn",
      stampKind: "gateIn",
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      userId: user,
    });
    expect(await eventsOf(gateMovementId)).toEqual([expect.objectContaining({ status: "sent" })]);
    // An inbound gate-out of its own is the delivering truck leaving: the cargo stays, nothing is told.
    await gateMovementService.stamp(gateMovementId, c, user, "gateOut");
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("publishes nothing when the stamp rolls back", async () => {
    const { c, gateMovementId } = await inbound();
    const { shipmentOutboxRepository } = await import("../repositories/shipmentOutbox.repository");
    const spy = vi.spyOn(shipmentOutboxRepository, "enqueue").mockRejectedValueOnce(new Error("boom"));
    await expect(gateMovementService.stamp(gateMovementId, c, user, "gateIn")).rejects.toThrow("boom");
    spy.mockRestore();
    expect(publish).not.toHaveBeenCalled();
    expect(await eventsOf(gateMovementId)).toEqual([]);
    expect((await gateMovementService.get(gateMovementId, c)).gateIn).toBeNull();
  });

  it("keeps an event that could not be published and publishes it on the next run", async () => {
    const { c, gateMovementId } = await inbound();
    publish.mockRejectedValueOnce(new Error("broker down"));
    await gateMovementService.stamp(gateMovementId, c, user, "gateIn");
    expect(publish).toHaveBeenCalledTimes(1);
    const [row] = await eventsOf(gateMovementId);
    expect(row).toMatchObject({ status: "pending" });
    await db.update(gateEventOutboxTable).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(and(eq(gateEventOutboxTable.movementId, gateMovementId)));
    const { deliverGateEvents } = await import("../services/gateEvents.service");
    await deliverGateEvents(gateMovementId);
    expect(publish).toHaveBeenCalledTimes(2);
    expect((await eventsOf(gateMovementId))[0]).toMatchObject({ status: "sent" });
  });

  it("publishes voided when a manager voids the gate-in", async () => {
    const { c, gateMovementId } = await inbound();
    await gateMovementService.stamp(gateMovementId, c, user, "gateIn");
    await gateAdminService.voidStamp(gateMovementId, c, user, "manager", "gateIn", "wrong truck");
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]![0]).toMatchObject({ kind: "voided", stampKind: "gateIn", userId: user });
  });

  it("publishes gateOut for the WH release that stamps the gate-out, and voided for its void", async () => {
    const c = randomUUID();
    const r = await svc.expectArrival(c, user, arrival(randomUUID()));
    const m = await gateMovementService.get(r.gateMovementId, c);
    await gateMovementRepository.update(r.gateMovementId, c, { releaseGates: m.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
    await gateMovementService.stamp(r.gateMovementId, c, user, "impRelease");
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0]).toMatchObject({ kind: "gateOut", stampKind: "impRelease" });
    await gateAdminService.voidStamp(r.gateMovementId, c, user, "manager", "impRelease", "not released");
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]![0]).toMatchObject({ kind: "voided", stampKind: "gateOut" });
  });

  it("publishes nothing for stamps that do not touch the gate-in or gate-out", async () => {
    const { c, gateMovementId } = await inbound();
    await gateMovementService.stamp(gateMovementId, c, user, "gateIn");
    publish.mockClear();
    await gateMovementService.stamp(gateMovementId, c, user, "expDraft");
    expect(publish).not.toHaveBeenCalled();
  });
});
