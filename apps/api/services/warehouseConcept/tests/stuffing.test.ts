import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { containerService } from "../services/container.service";
import { reweighService } from "../services/reweigh.service";
import { gateExceptionService } from "../services/gateException.service";
import { warehouseRecordsService as records } from "../services/warehouseRecords.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";

const { shipmentUpdate } = vi.hoisted(() => ({ shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})) }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
const outboxOf = (movementId: string) => db.select().from(shipmentOutboxTable).where(eq(shipmentOutboxTable.movementId, movementId)).orderBy(shipmentOutboxTable.createdAt);

// Inbound (příjem) LCL positions linked to shipments, received in the warehouse (re-weighed, WH receipt).
async function received(c: string, n: number) {
  const shipmentIds = Array.from({ length: n }, () => randomUUID());
  const res = await warehouseImportService.importShipments(c, user, shipmentIds);
  const out = [];
  for (const [i, r] of res.entries()) {
    const id = r.movementId!;
    await gateMovementRepository.update(id, c, { visit: "příjem", handling: "Export", colli: 4, weightKg: 2000, measureCbm: 6 });
    await gateMovementService.stamp(id, c, user, "expDraft");
    await reweighService.record(id, c, user, { weighedKg: 2000 });
    await gateMovementService.stamp(id, c, user, "expReceipt");
    out.push({ id, ref: r.ref, shipmentId: shipmentIds[i]! });
  }
  return out;
}

async function exportContainer(n = 2) {
  const c = randomUUID();
  const houses = await received(c, n);
  const box = await records.createContainer(c, { number: "TGHU 123 456-0", equipment: "20' DV", direction: "Loading" }, user);
  return { c, box, houses };
}

beforeEach(() => {
  shipmentUpdate.mockReset();
  shipmentUpdate.mockImplementation(async () => ({}));
});

describe("export stuffing plan", () => {
  it("plans only inbound positions in the warehouse, one container at a time, with totals against capacity", async () => {
    const { c, box, houses } = await exportContainer(2);
    // Not received yet / outgoing cargo / already in another container.
    const [fresh] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
    await expect(containerService.addPositions(box.id, c, user, [fresh!.movementId!])).rejects.toThrow(/outgoing cargo/);
    await gateMovementRepository.update(fresh!.movementId!, c, { visit: "příjem", handling: "Export" });
    await expect(containerService.addPositions(box.id, c, user, [fresh!.movementId!])).rejects.toThrow(/not received/);

    const planned = await containerService.addPositions(box.id, c, user, houses.map((h) => h.id));
    expect(planned.status).toBe("Planning");
    expect(planned.positions.map((p) => p.positionRef)).toEqual(houses.map((h) => h.ref));
    expect(planned.totals).toMatchObject({ pieces: 8, kg: 4000, cbm: 12, capacityCbm: 31, fillCbmPct: 39, overCapacity: false });

    const other = await records.createContainer(c, { number: "MSKU 000 000-1", direction: "Loading" }, user);
    await expect(containerService.addPositions(other.id, c, user, [houses[0]!.id])).rejects.toThrow(/already in container TGHU 123 456-0/);
    // Two containers adding the same position at once: one wins.
    const [z] = await received(c, 1);
    const race = await Promise.allSettled([containerService.addPositions(box.id, c, user, [z!.id]), containerService.addPositions(other.id, c, user, [z!.id])]);
    expect(race.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    await containerService.removePosition(race[0]!.status === "fulfilled" ? box.id : other.id, c, user, z!.id);

    const reordered = await containerService.reorder(box.id, c, user, [houses[1]!.id, houses[0]!.id]);
    expect(reordered.positions.map((p) => p.movementId)).toEqual([houses[1]!.id, houses[0]!.id]);
    const removed = await containerService.removePosition(box.id, c, user, houses[1]!.id);
    expect(removed.positions).toHaveLength(1);
  });

  it("refuses a position on hold", async () => {
    const { c, box, houses } = await exportContainer(1);
    await gateExceptionService.create(houses[0]!.id, c, user, { type: "Damaged", pieces: 1 });
    await expect(containerService.addPositions(box.id, c, user, [houses[0]!.id])).rejects.toThrow(/on hold/);
  });

  it("stuffs after the gate-in, closes with the seal, and the gate-out releases the stuffed positions", async () => {
    const { c, box, houses } = await exportContainer(2);
    const [a, b] = houses as [(typeof houses)[0], (typeof houses)[0]];
    await containerService.addPositions(box.id, c, user, [a.id, b.id]);
    await expect(containerService.setStuffed(box.id, c, user, a.id, true)).rejects.toThrow(/gate-in first/);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await expect(containerService.stamp(box.id, c, user, "user", "close", { seal: "CZ1" })).rejects.toThrow(/Nothing is stuffed/);
    const stuffed = await containerService.setStuffed(box.id, c, user, a.id, true);
    expect(stuffed.container.status).toBe("Stuffing");
    // A stuffed position leaves with the container: no WH release, no void of its receipt.
    expect((await gateMovementService.get(a.id, c)).lifecycle.stage).toBe("stuffed");
    await expect(gateMovementService.stamp(a.id, c, user, "impRelease")).rejects.toThrow(/leaves with the container/);
    await expect(gateAdminService.voidStamp(a.id, c, user, "manager", "expReceipt", "x")).rejects.toThrow(/remove it from the container first/);
    await expect(containerService.stamp(box.id, c, user, "user", "gateOut")).rejects.toThrow(/Close the stuffing/);
    await expect(containerService.stamp(box.id, c, user, "user", "close")).rejects.toThrow(/seal number/);
    await containerService.stamp(box.id, c, user, "user", "close", { seal: "CZ0084412" });
    await expect(containerService.setStuffed(box.id, c, user, b.id, true)).rejects.toThrow(/closed/);
    await expect(containerService.stamp(box.id, c, user, "user", "gateOut", { recordedAt: new Date().toISOString() })).rejects.toThrow(/needs a connection/);

    shipmentUpdate.mockClear();
    const [g1, g2] = await Promise.allSettled([
      containerService.stamp(box.id, c, user, "manager", "gateOut", { plate: "3AB 1234" }),
      containerService.stamp(box.id, c, user, "manager", "gateOut", { plate: "3AB 1234" }),
    ]);
    expect([g1.status, g2.status].sort()).toEqual(["fulfilled", "rejected"]);
    const left = await gateMovementService.get(a.id, c);
    expect(left).toMatchObject({ status: "Released", leftContainerId: box.id, impRelease: null });
    expect(left.leftAt).not.toBeNull();
    expect(left.storage).toMatchObject({ stopped: true });
    expect(left.lifecycle.stage).toBe("left");
    const owed = await outboxOf(a.id);
    expect(owed.filter((o) => o.kind === "released")).toHaveLength(1);
    expect(owed.find((o) => o.kind === "released")).toMatchObject({ stamp: "containerGateOut", payload: { plateNumber: "3AB 1234", warehouseReleasedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } });
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ shipmentId: a.shipmentId, plateNumber: "3AB 1234" }), expect.anything());
    // Not stuffed: stays in the warehouse and is out of the container.
    const stayed = await gateMovementService.get(b.id, c);
    expect(stayed).toMatchObject({ status: "In Warehouse", leftAt: null, container: null });
    expect(stayed.storage.stopped).toBe(false);
    expect(stayed.events.at(-1)!.kind).toBe("notLoaded");
    const after = await containerService.detail(box.id, c);
    expect(after).toMatchObject({ status: "Gone out", seal: "CZ0084412", plate: "3AB 1234" });
    expect(after.gatedOut).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(after.positions.map((p) => p.movementId)).toEqual([a.id]);
  });

  it("voids the container gate-out (manager): the positions come back and the owed updates are cancelled", async () => {
    const { c, box, houses } = await exportContainer(1);
    const a = houses[0]!;
    await containerService.addPositions(box.id, c, user, [a.id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await containerService.setStuffed(box.id, c, user, a.id, true);
    await containerService.stamp(box.id, c, user, "user", "close", { seal: "S1" });
    shipmentUpdate.mockRejectedValue(new Error("down"));
    await containerService.stamp(box.id, c, user, "user", "gateOut");
    await expect(containerService.voidStamp(box.id, c, user, "manager", "close", "x")).rejects.toThrow(/gate-out first/);
    const res = await containerService.voidStamp(box.id, c, user, "manager", "gateOut", "wrong truck");
    expect(res.container.status).toBe("Closed");
    const back = await gateMovementService.get(a.id, c);
    expect(back).toMatchObject({ status: "In Warehouse", leftAt: null, leftContainerId: null });
    expect(back.storage.stopped).toBe(false);
    expect((await outboxOf(a.id)).filter((o) => o.stamp === "containerGateOut").map((o) => o.status)).toEqual(["cancelled"]);
  });

  it("sends a plate entered after the gate-out to the shipments of the positions that left", async () => {
    const { c, box, houses } = await exportContainer(1);
    const a = houses[0]!;
    await containerService.addPositions(box.id, c, user, [a.id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await containerService.setStuffed(box.id, c, user, a.id, true);
    await containerService.stamp(box.id, c, user, "user", "close", { seal: "S1" });
    await containerService.stamp(box.id, c, user, "user", "gateOut");
    shipmentUpdate.mockClear();
    await records.updateContainer(box.id, c, { plate: "5XY 9988" }, user, "admin");
    expect(shipmentUpdate).toHaveBeenCalledWith({ shipmentId: a.shipmentId, plateNumber: "5XY 9988" }, { authData: { userID: user, companyID: c, role: "user" } });
    await expect(records.updateContainer(box.id, c, { gatedOut: "2020-01-01" })).rejects.toThrow(/follows the container's gate-out/);
  });

  it("refuses archiving a stuffed position; a planned one is taken out of the plan", async () => {
    const { c, box, houses } = await exportContainer(2);
    const [a, b] = houses as [(typeof houses)[0], (typeof houses)[0]];
    await containerService.addPositions(box.id, c, user, [a.id, b.id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await containerService.setStuffed(box.id, c, user, a.id, true);
    await expect(gateAdminService.archive(a.id, c, user, "manager", "duplicate")).rejects.toThrow(/stuffed in container/);
    await gateAdminService.archive(b.id, c, user, "manager", "duplicate");
    const detail = await containerService.detail(box.id, c);
    expect(detail.positions.map((p) => p.movementId)).toEqual([a.id]);
    // Un-stuffing is allowed until the close.
    const un = await containerService.setStuffed(box.id, c, user, a.id, false);
    expect(un.container.status).toBe("Planning");
  });

  it("answers a stuffed mark sent twice from the offline queue once", async () => {
    const { c, box, houses } = await exportContainer(1);
    const a = houses[0]!;
    await containerService.addPositions(box.id, c, user, [a.id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn", { recordedAt: new Date(Date.now() - 60_000).toISOString(), clientRequestId: randomUUID() });
    const req = { recordedAt: new Date().toISOString(), clientRequestId: randomUUID() };
    expect((await containerService.setStuffed(box.id, c, user, a.id, true, req)).outcome).toBe("done");
    expect((await containerService.setStuffed(box.id, c, user, a.id, true, req)).outcome).toBe("already_done");
    expect((await containerService.setStuffed(box.id, c, user, a.id, true, { clientRequestId: randomUUID() })).outcome).toBe("done_by_someone_else");
  });

  it("does not let a house put on hold after it was stuffed leave with the container", async () => {
    const { c, box, houses } = await exportContainer(1);
    const a = houses[0]!;
    await containerService.addPositions(box.id, c, user, [a.id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await containerService.setStuffed(box.id, c, user, a.id, true);
    await containerService.stamp(box.id, c, user, "user", "close", { seal: "S1" });
    await gateExceptionService.create(a.id, c, user, { type: "Damaged", pieces: 1 });
    await expect(containerService.stamp(box.id, c, user, "user", "gateOut")).rejects.toThrow(/is on hold/);
    const still = await gateMovementService.get(a.id, c);
    expect(still).toMatchObject({ leftAt: null, status: "In Warehouse" });
    expect((await outboxOf(a.id)).filter((o) => o.stamp === "containerGateOut")).toEqual([]);
  });

  it("never both stuffs and WH-releases a position, nor voids the receipt of one being stuffed (parallel)", async () => {
    const { c, box, houses } = await exportContainer(4);
    await containerService.addPositions(box.id, c, user, houses.map((h) => h.id));
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    for (const h of houses) {
      const row = await gateMovementService.get(h.id, c);
      await gateMovementRepository.update(h.id, c, { releaseGates: row.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
    }
    for (const h of houses.slice(0, 2)) {
      await Promise.allSettled([containerService.setStuffed(box.id, c, user, h.id, true), gateMovementService.stamp(h.id, c, user, "impRelease")]);
      const m = await gateMovementService.get(h.id, c);
      expect(!!m.container?.stuffedAt && !!m.impRelease).toBe(false);
    }
    for (const h of houses.slice(2)) {
      await Promise.allSettled([containerService.setStuffed(box.id, c, user, h.id, true), gateAdminService.voidStamp(h.id, c, user, "manager", "expReceipt", "wrong")]);
      const m = await gateMovementService.get(h.id, c);
      expect(!!m.container?.stuffedAt && !m.expReceipt).toBe(false);
    }
  });

  it("refuses a typed gated-out date once the container is gated in (the gate-out stamp takes it out)", async () => {
    const c = randomUUID();
    const box = await records.createContainer(c, { number: "TGHU 000 001-0", direction: "Loading" }, user);
    await records.updateContainer(box.id, c, { gatedOut: "2026-10-01" });
    await records.updateContainer(box.id, c, { gatedOut: "" });
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await expect(records.updateContainer(box.id, c, { gatedOut: "2026-10-14" })).rejects.toThrow(/stamp its Container gate-out/);
  });
});
