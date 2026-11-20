import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { positionReceiptService } from "../services/positionReceipt.service";
import { reweighService } from "../services/reweigh.service";
import { containerService } from "../services/container.service";
import { warehouseRecordsService as records } from "../services/warehouseRecords.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { pragueDate } from "../services/storage";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";
import { warehouseStockLineTable } from "../schemas/warehouseStock.schema";

const { shipmentUpdate } = vi.hoisted(() => ({ shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})) }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    invoicing: (await import("./shipmentFakes")).invoicingFake,
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
const outboxOf = (movementId: string) => db.select().from(shipmentOutboxTable).where(eq(shipmentOutboxTable.movementId, movementId));
const lineOf = (c: string, movementId: string) =>
  db.select().from(warehouseStockLineTable).where(and(eq(warehouseStockLineTable.companyId, c), eq(warehouseStockLineTable.movementId, movementId)));

// One outgoing (výdej) LCL position linked to a shipment, 10 pieces, in no container: loose import cargo.
async function loosePosition() {
  const c = randomUUID();
  const shipmentId = randomUUID();
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  const id = r!.movementId!;
  await gateMovementRepository.update(id, c, { colli: 10, weightKg: 1000 });
  return { c, id, ref: r!.ref, shipmentId };
}

beforeEach(() => {
  shipmentUpdate.mockReset();
  shipmentUpdate.mockImplementation(async () => ({}));
});

describe("receipt of loose import cargo (Q19)", () => {
  it("refuses LCL cargo before the re-weigh, then receives it: date, status, stock location, write-back", async () => {
    const { c, id, ref, shipmentId } = await loosePosition();
    await expect(positionReceiptService.record(id, c, user, "user", { pieces: 10 })).rejects.toThrow(/re-weighed before the receipt/);
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    const res = await positionReceiptService.record(id, c, user, "user", { pieces: 10, condition: "Good", location: "a-03-2" });
    expect(res.outcome).toBe("done");
    expect(res.suggestExceptions).toEqual([]);
    expect(res.movement).toMatchObject({ status: "In Warehouse" });
    expect(res.movement.receivedAt).not.toBeNull();
    expect(res.movement.lifecycle.stage).toBe("in_warehouse");
    const ev = res.movement.events.find((e) => e.kind === "positionReceived");
    expect(ev?.detail).toBe("10 of 10 pcs counted · Good · at a-03-2");
    expect((await lineOf(c, id))[0]).toMatchObject({ location: "A-03-2", status: "Available" });
    const owed = await outboxOf(id);
    expect(owed).toEqual([expect.objectContaining({ kind: "received", stamp: "receipt", payload: expect.objectContaining({ warehouseReference: ref }) })]);
    expect(shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ shipmentId, warehouseReference: ref }), expect.anything());
    await expect(positionReceiptService.record(id, c, user, "user", { pieces: 10 })).rejects.toThrow(/already received/);
  });

  it("holds the WH release until the receipt; the receipt then starts the clock, counts the stock and keeps its date", async () => {
    const { c, id } = await loosePosition();
    const m = await gateMovementService.get(id, c);
    await gateMovementRepository.update(id, c, { releaseGates: m.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
    // The truck that collects the cargo waits for the receipt on the server too, as the web's steps show it.
    await expect(gateMovementService.stamp(id, c, user, "gateIn")).rejects.toThrow(/Not received yet — record the receipt first/);
    await expect(gateMovementService.stamp(id, c, user, "impRelease")).rejects.toThrow(/Not received yet — record the receipt first/);
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    const res = await positionReceiptService.record(id, c, user, "user", { pieces: 9, condition: "Good", location: "b-1" });
    expect(res.movement.storage.startSource).toBe("receipt");
    expect((await lineOf(c, id))[0]).toMatchObject({ pieces: 9, location: "B-1" });
    await expect(gateMovementService.update(id, c, user, { loadInDate: "2026-01-02" })).rejects.toThrow(/set by the receipt — a manager moves it earlier \(with a reason\) or voids the receipt/);
    // Received: its gate-in is named "Pick-up truck in" (Q19).
    const truck = await gateMovementService.stamp(id, c, user, "gateIn");
    expect(truck.events.at(-1)).toMatchObject({ kind: "gateIn", label: "Pick-up truck in" });
    expect((await gateMovementService.stamp(id, c, user, "impRelease")).impRelease).not.toBeNull();
  });

  it("a Trucking pick-up run bringing the cargo in: plain Gate-in, not waiting for the receipt", async () => {
    const { c, id } = await loosePosition();
    const m = await gateMovementService.get(id, c);
    const run = { leg: "IN" as const, company: "", plate: "", driver: "", phone: "", gateTime: "", source: { kind: "trucking" as const, tripRef: "LCZ1", tripKind: "PICKUP_RUN" } };
    await gateMovementRepository.update(id, c, { transportLegs: [run, ...m.transportLegs.filter((l) => l.leg !== "IN")] });
    const res = await gateMovementService.stamp(id, c, user, "gateIn");
    expect(res.events.at(-1)).toMatchObject({ kind: "gateIn", label: "Gate-in" });
    // The WH release still waits for the receipt.
    await gateMovementRepository.update(id, c, { releaseGates: m.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
    await expect(gateMovementService.stamp(id, c, user, "impRelease")).rejects.toThrow(/Not received yet — record the receipt first/);
  });

  // Review of step 7: Import FCL cargo comes in its container even with no container house here.
  it("cargo that comes in a container (FCL stripping, a container number) has no loose-cargo receipt and no wait for one", async () => {
    for (const over of [{ operationType: "FCL stripping" as const }, { containerNumber: "MSKU6119027" }]) {
      const { c, id } = await loosePosition();
      await gateMovementRepository.update(id, c, over);
      await expect(positionReceiptService.record(id, c, user, "user", { pieces: 10 })).rejects.toThrow(/comes in a container|has container number MSKU6119027/);
      const m = await gateMovementService.get(id, c);
      await gateMovementRepository.update(id, c, { releaseGates: m.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
      expect((await gateMovementService.stamp(id, c, user, "gateIn")).gateIn).not.toBeNull();
      expect((await gateMovementService.stamp(id, c, user, "impRelease")).impRelease).not.toBeNull();
    }
  });

  // Review of step 7: a receipt never moves a typed received day later (storage given away, a manager's call).
  it("keeps an earlier typed Received in warehouse day: the clock and the shipment keep it", async () => {
    const { c, id } = await loosePosition();
    await gateMovementRepository.update(id, c, { loadInDate: "2026-01-02" });
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    const res = await positionReceiptService.record(id, c, user, "user", { pieces: 10, condition: "Good", location: "A-1" });
    expect(res.movement.loadInDate).toBe("2026-01-02");
    expect(res.movement.receivedAt).toBe(new Date("2026-01-01T23:00:00.000Z").toISOString());
    expect(res.movement.storage).toMatchObject({ startDate: "2026-01-02", startSource: "receipt" });
    expect(res.movement.events.find((e) => e.kind === "positionReceived")?.detail).toBe("10 of 10 pcs counted · Good · at A-1 · Received in warehouse 2026-01-02 kept");
    expect((await outboxOf(id))[0]!.payload).toMatchObject({ warehouseReceivedDate: "2026-01-02" });
  });

  it("offers Short and Damaged exceptions and answers a replay once", async () => {
    const { c, id } = await loosePosition();
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    const req = { pieces: 8, condition: "Damaged packaging", location: "", clientRequestId: randomUUID() };
    const res = await positionReceiptService.record(id, c, user, "user", req);
    expect(res.suggestExceptions).toEqual([
      { type: "Short", pieces: 2 },
      { type: "Damaged", pieces: null },
    ]);
    expect(res.notice).toMatch(/Short 2 pcs against the expected 10 — record an exception\? · Damaged packaging — record a Damaged exception\?/);
    const again = await positionReceiptService.record(id, c, user, "user", req);
    expect(again.outcome).toBe("already_done");
    expect((await gateMovementService.get(id, c)).events.filter((e) => e.kind === "positionReceived")).toHaveLength(1);
  });

  it("refuses a house of a container (its tally receives it)", async () => {
    const { c, id } = await loosePosition();
    const box = await records.createContainer(c, { number: "MSKU 611 902-7", equipment: "40' HC", direction: "Unloading" }, user);
    await containerService.addPositions(box.id, c, user, [id]);
    await expect(positionReceiptService.record(id, c, user, "user", {})).rejects.toThrow(/house of container MSKU 611 902-7/);
  });

  it("voids the receipt (manager): the typed date it replaced comes back", async () => {
    const { c, id } = await loosePosition();
    await gateMovementRepository.update(id, c, { loadInDate: "2026-01-02" });
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    await positionReceiptService.record(id, c, user, "user", { pieces: 10 });
    await expect(positionReceiptService.voidReceipt(id, c, user, "user", "wrong position")).rejects.toThrow(/manager/);
    const res = await positionReceiptService.voidReceipt(id, c, user, "manager", "wrong position");
    expect(res.movement.receivedAt).toBeNull();
    expect(res.movement.loadInDate).toBe("2026-01-02");
    // The receipt's received date already reached the shipment: it is not changed back, and the
    // record says so after the void.
    expect(res.movement.events.slice(-2).map((e) => e.kind)).toEqual(["positionReceiptVoided", "shipmentMayNeedCorrecting"]);
    expect(res.notice).toMatch(/not changed back/);
    // Not received any more: the WH release waits for a receipt or the typed date again — here the typed date is back.
    expect(res.movement.storage).toMatchObject({ startDate: "2026-01-02", startSource: "loadInDate" });
  });

  // Mock council R29: nothing counted is not a receipt.
  it("refuses a receipt of 0 pieces and points to a Short exception", async () => {
    const { c, id } = await loosePosition();
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    await expect(positionReceiptService.record(id, c, user, "user", { pieces: 0 })).rejects.toThrow(/Short exception/);
    expect((await gateMovementService.get(id, c)).receivedAt).toBeNull();
  });

  // Mock council R28: a manager may move the receipt's day earlier, with a reason.
  it("lets a manager move the receipt's day earlier with a reason: clock, log and shipment follow", async () => {
    const { c, id } = await loosePosition();
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    const received = (await positionReceiptService.record(id, c, user, "user", { pieces: 10 })).movement;
    const day = received.loadInDate;
    const earlier = pragueDate(new Date(Date.parse(`${day}T12:00:00Z`) - 2 * 86_400_000));
    await expect(gateMovementService.update(id, c, user, { loadInDate: earlier }, "user", "", "came on Monday")).rejects.toThrow(/a manager moves it earlier/);
    await expect(gateMovementService.update(id, c, user, { loadInDate: earlier }, "manager")).rejects.toThrow(/Give a reason/);
    await expect(gateMovementService.update(id, c, user, { loadInDate: "" }, "manager", "", "typo")).rejects.toThrow(/can't be cleared/);
    shipmentUpdate.mockClear();
    const moved = await gateMovementService.update(id, c, user, { loadInDate: earlier }, "manager", "", "came on Monday");
    expect(moved.loadInDate).toBe(earlier);
    expect(moved.receivedAt).not.toBeNull();
    expect(pragueDate(new Date(moved.receivedAt!))).toBe(earlier);
    expect(moved.storage).toMatchObject({ startDate: earlier });
    // Logged; the shipment's "Shipment updated" follows it once told.
    expect(moved.events.map((e) => e.kind).slice(-2)).toEqual(["storageClockChanged", "shipmentUpdated"]);
    expect(moved.events.at(-2)).toMatchObject({ kind: "storageClockChanged", detail: `was ${day} · reason: came on Monday` });
    expect(await outboxOf(id)).toContainEqual(expect.objectContaining({ kind: "received", stamp: "receipt", payload: expect.objectContaining({ warehouseReceivedDate: earlier }) }));
    // Later again is voiding the receipt.
    await expect(gateMovementService.update(id, c, user, { loadInDate: day }, "manager", "", "back")).rejects.toThrow(/only earlier/);
  });

  // Mock council S11-2: the receipt voided and done again at another rack.
  it("a receipt done again after a void puts its new location on the stock line", async () => {
    const { c, id } = await loosePosition();
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    await positionReceiptService.record(id, c, user, "user", { pieces: 10, location: "a-03-2" });
    await positionReceiptService.voidReceipt(id, c, user, "manager", "wrong rack");
    await positionReceiptService.record(id, c, user, "user", { pieces: 10, location: "b-02" });
    const lines = await lineOf(c, id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ location: "B-02", status: "Available" });
  });

  // Review of step 7: a second void looks only at the update of the receipt it voids.
  it("a second void does not warn about the update of an earlier receipt voided before", async () => {
    const { c, id } = await loosePosition();
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    await positionReceiptService.record(id, c, user, "user", { pieces: 10 });
    const first = await positionReceiptService.voidReceipt(id, c, user, "manager", "wrong count");
    expect(first.movement.events.at(-1)!.kind).toBe("shipmentMayNeedCorrecting");
    // The second receipt's update does not reach the shipment before its void.
    shipmentUpdate.mockRejectedValue(new Error("Shipments is down"));
    await positionReceiptService.record(id, c, user, "user", { pieces: 9 });
    const second = await positionReceiptService.voidReceipt(id, c, user, "manager", "wrong count again");
    expect(second.movement.events.slice(-2).map((e) => e.kind)).toEqual(["positionReceiptVoided", "shipmentUpdateCancelled"]);
    expect(second.notice).toBe("");
  });
});
