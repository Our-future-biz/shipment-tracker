import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { containerService } from "../services/container.service";
import { reweighService } from "../services/reweigh.service";
import { warehouseRecordsService as records } from "../services/warehouseRecords.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";
import { warehouseContainerPositionTable, warehouseContainerTable } from "../schemas/warehouseRecords.schema";

const { shipmentUpdate } = vi.hoisted(() => ({ shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})) }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
const outboxOf = (movementId: string) => db.select().from(shipmentOutboxTable).where(eq(shipmentOutboxTable.movementId, movementId));

// An import container with `n` houses: outgoing (výdej) LCL positions linked to shipments, 10 pieces each.
async function importContainer(n = 2) {
  const c = randomUUID();
  const shipmentIds = Array.from({ length: n }, () => randomUUID());
  const res = await warehouseImportService.importShipments(c, user, shipmentIds);
  const houses = res.map((r, i) => ({ id: r.movementId!, ref: r.ref, shipmentId: shipmentIds[i]! }));
  for (const h of houses) await gateMovementRepository.update(h.id, c, { colli: 10, weightKg: 1000 });
  const box = await records.createContainer(c, { number: "MSKU 611 902-7", equipment: "40' HC", direction: "Unloading" }, user);
  await containerService.addPositions(box.id, c, user, houses.map((h) => h.id));
  return { c, box, houses };
}

beforeEach(() => {
  shipmentUpdate.mockReset();
  shipmentUpdate.mockImplementation(async () => ({}));
});
afterEach(() => vi.useRealTimers());

describe("import stripping tally", () => {
  it("refuses a tick before the container gate-in and an LCL tick before the re-weigh", async () => {
    const { c, box, houses } = await importContainer(1);
    const h = houses[0]!;
    await expect(containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" })).rejects.toThrow(/gate-in first/);
    await expect(reweighService.record(h.id, c, user, { weighedKg: 990 })).rejects.toThrow(/not arrived yet/);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await expect(containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" })).rejects.toThrow(/re-weighed before the tick-off/);
    expect(await outboxOf(h.id)).toEqual([]);
  });

  it("ticks a house received: received date (Prague day), storage start, write-back with the WCZ ref", async () => {
    const { c, box, houses } = await importContainer(1);
    const h = houses[0]!;
    // Sent at 00:30 Prague on 15 Oct, ticked at 23:50 on 14 Oct.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T22:30:00Z"));
    await containerService.stamp(box.id, c, user, "manager", "gateIn", { recordedAt: "2026-10-14T21:00:00Z", clientRequestId: randomUUID() });
    await reweighService.record(h.id, c, user, { weighedKg: 1010, recordedAt: "2026-10-14T22:05:00Z", clientRequestId: randomUUID() });
    const res = await containerService.tally(box.id, c, user, "manager", h.id, { outcome: "received", pieces: 10, location: "A-12" }, { recordedAt: "2026-10-14T21:50:00Z", clientRequestId: randomUUID() });
    vi.useRealTimers();
    expect(res.outcome).toBe("done");
    expect(res.suggestException).toBeNull();
    const m = await gateMovementService.get(h.id, c);
    expect(m).toMatchObject({ receivedAt: "2026-10-14T21:50:00.000Z", loadInDate: "2026-10-14", status: "In Warehouse" });
    expect(m.storage).toMatchObject({ started: true, startDate: "2026-10-14", startSource: "tally" });
    expect(m.lifecycle.stage).toBe("in_warehouse");
    expect(m.container).toMatchObject({ number: "MSKU 611 902-7", tallyOutcome: "received", tickedAt: "2026-10-14T21:50:00.000Z" });
    const owed = await outboxOf(h.id);
    expect(owed).toHaveLength(1);
    expect(owed[0]).toMatchObject({ kind: "received", stamp: "tally", payload: { warehouseReceivedDate: "2026-10-14", warehouseReference: h.ref } });
    expect(shipmentUpdate).toHaveBeenCalledWith(
      { shipmentId: h.shipmentId, warehouseReceivedDate: "2026-10-14", warehouseReference: h.ref },
      { authData: { userID: user, companyID: c, role: "user" } },
    );
    // The first tick starts the stripping; the house's received date is the tally's now.
    expect(res.container).toMatchObject({ status: "Stripped", strippingStartedAt: "2026-10-14T21:50:00.000Z" });
    await expect(gateMovementService.update(h.id, c, user, { loadInDate: "2026-10-10" })).rejects.toThrow(/set by the stripping tally/);
  });

  it("answers a replay and a second clerk without ticking twice", async () => {
    const { c, box, houses } = await importContainer(1);
    const h = houses[0]!;
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await reweighService.record(h.id, c, user, { weighedKg: 1000 });
    const req = { clientRequestId: randomUUID() };
    const [a, b] = await Promise.all([
      containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" }, req),
      containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" }, req),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(["already_done", "done"]);
    const other = await containerService.tally(box.id, c, user, "user", h.id, { outcome: "short", reason: "x" }, { clientRequestId: randomUUID() });
    expect(other.outcome).toBe("done_by_someone_else");
    await expect(containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" })).rejects.toThrow(/already tallied/);
    expect(await outboxOf(h.id)).toHaveLength(1);
    expect((await gateMovementService.get(h.id, c)).events.filter((e) => e.kind === "tallyReceived")).toHaveLength(1);
  });

  it("needs a reason for short / not arrived, suggests the exception and completes the stripping", async () => {
    const { c, box, houses } = await importContainer(2);
    const [a, b] = houses as [(typeof houses)[0], (typeof houses)[0]];
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await expect(containerService.tally(box.id, c, user, "user", a.id, { outcome: "short" })).rejects.toThrow(/reason is required/);
    const short = await containerService.tally(box.id, c, user, "user", a.id, { outcome: "short", pieces: 7, reason: "3 cartons missing" });
    // The tally opens the Short exception itself (Council Outlay 5, decision 11): nothing to suggest.
    expect(short.suggestException).toBeNull();
    expect(short.notice).toMatch(/Exception recorded: Short 3 pcs/);
    const held = await gateMovementService.get(a.id, c);
    expect(held.exceptions).toEqual([expect.objectContaining({ type: "Short", pieces: 3, note: "3 cartons missing", source: "tally", container: "MSKU 611 902-7", status: "open" })]);
    expect(short.container.status).toBe("Stripping");
    await expect(containerService.stamp(box.id, c, user, "user", "gateOut")).rejects.toThrow(/1 house not accounted for/);
    // A short house is not received.
    expect((await gateMovementService.get(a.id, c)).receivedAt).toBeNull();
    const notArrived = await containerService.tally(box.id, c, user, "user", b.id, { outcome: "not_arrived", reason: "not on the manifest" });
    expect(notArrived.container.status).toBe("Stripped");
    expect(notArrived.container.strippingCompletedAt).not.toBeNull();
    const out = await containerService.stamp(box.id, c, user, "user", "gateOut");
    expect(out.container.status).toBe("Gone out");
  });

  it("refuses the WH release of a house not ticked received, and allows it after the tick", async () => {
    const { c, box, houses } = await importContainer(1);
    const h = houses[0]!;
    const row = await gateMovementService.get(h.id, c);
    await gateMovementRepository.update(h.id, c, { releaseGates: row.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
    await expect(gateMovementService.stamp(h.id, c, user, "impRelease")).rejects.toThrow(/tick this house off/);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await reweighService.record(h.id, c, user, { weighedKg: 1000 });
    await containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" });
    const released = await gateMovementService.stamp(h.id, c, user, "impRelease");
    expect(released.lifecycle.stage).toBe("left");
    expect(released.storage.stopped).toBe(true);
  });

  it("voids a tally (manager): not received any more, the owed update cancelled and logged", async () => {
    const { c, box, houses } = await importContainer(1);
    const h = houses[0]!;
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await reweighService.record(h.id, c, user, { weighedKg: 1000 });
    shipmentUpdate.mockRejectedValueOnce(new Error("down"));
    await containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" });
    await expect(containerService.voidTally(box.id, c, user, "user", h.id, "wrong house")).rejects.toThrow(/manager/);
    await expect(containerService.voidTally(box.id, c, user, "manager", h.id, " ")).rejects.toThrow(/reason/);
    const res = await containerService.voidTally(box.id, c, user, "manager", h.id, "wrong house");
    expect(res.notice).toBe("");
    const m = await gateMovementService.get(h.id, c);
    expect(m).toMatchObject({ receivedAt: null, loadInDate: "", status: "Expected" });
    expect(m.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["tallyVoided", "shipmentUpdateCancelled"]));
    expect((await outboxOf(h.id)).map((o) => o.status)).toEqual(["cancelled"]);
    expect(res.container.positions[0]).toMatchObject({ tallyOutcome: "", tickedAt: null });
  });

  it("logs that the shipment may need correcting when a voided tick already reached it", async () => {
    const { c, box, houses } = await importContainer(1);
    const h = houses[0]!;
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await reweighService.record(h.id, c, user, { weighedKg: 1000 });
    await containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" });
    const res = await containerService.voidTally(box.id, c, user, "manager", h.id, "wrong house");
    expect(res.notice).toMatch(/not changed back/);
    expect((await gateMovementService.get(h.id, c)).events.at(-1)).toMatchObject({ kind: "shipmentMayNeedCorrecting" });
  });

  it("restores the typed received date when a tick that replaced it is voided", async () => {
    const { c, box, houses } = await importContainer(1);
    const h = houses[0]!;
    await gateMovementRepository.update(h.id, c, { loadInDate: "2026-10-01" });
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await reweighService.record(h.id, c, user, { weighedKg: 1000 });
    await containerService.tally(box.id, c, user, "user", h.id, { outcome: "received" });
    expect((await gateMovementService.get(h.id, c)).loadInDate).not.toBe("2026-10-01");
    await containerService.voidTally(box.id, c, user, "manager", h.id, "wrong house");
    const m = await gateMovementService.get(h.id, c);
    expect(m).toMatchObject({ receivedAt: null, loadInDate: "2026-10-01" });
    expect(m.storage.startSource).toBe("loadInDate");
  });

  it("needs the start of stripping before an import container with no houses gates out", async () => {
    const c = randomUUID();
    const box = await records.createContainer(c, { number: "EMPTY 1", direction: "Unloading" }, user);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await expect(containerService.stamp(box.id, c, user, "user", "gateOut")).rejects.toThrow(/Start the stripping first/);
    await containerService.stamp(box.id, c, user, "user", "strippingStart");
    expect((await containerService.stamp(box.id, c, user, "user", "gateOut")).container.status).toBe("Gone out");
  });

  it("does not tally an old one-position link (inbound or outbound), and it does not hold the gate-out", async () => {
    const c = randomUUID();
    const inbound = await gateMovementService.create(c, user, { gateRef: "WCZ-IN", handling: "Export", visit: "příjem" });
    const outbound = await gateMovementService.create(c, user, { gateRef: "WCZ-OUT", handling: "Import", visit: "výdej", loadInDate: "2026-10-01" });
    for (const m of [inbound, outbound]) {
      // Registered the old way: one position, default direction (Unloading), linked by migration 0017.
      const [box] = await db.insert(warehouseContainerTable).values({ companyId: c, movementId: m.id, number: `OLD ${m.gateRef}`, equipment: "20' DV" }).returning();
      await db.insert(warehouseContainerPositionTable).values({ companyId: c, containerId: box!.id, movementId: m.id, sequence: 1, addedBy: "migration" });
      await containerService.stamp(box!.id, c, user, "user", "gateIn");
      await expect(containerService.tally(box!.id, c, user, "user", m.id, { outcome: "received" })).rejects.toThrow(m.visit === "výdej" ? /old container register/ : /inbound cargo/);
      expect((await containerService.stamp(box!.id, c, user, "user", "gateOut")).container.status).toBe("Gone out");
      expect(await outboxOf(m.id)).toEqual([]);
    }
    expect((await gateMovementService.get(outbound.id, c)).loadInDate).toBe("2026-10-01");
  });
});
