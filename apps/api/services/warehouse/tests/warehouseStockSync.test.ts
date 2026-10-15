import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { containerService } from "../services/container.service";
import { reweighService } from "../services/reweigh.service";
import { warehouseRecordsService as records } from "../services/warehouseRecords.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { warehouseStockService as stock } from "../services/warehouseStock.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseBondedEntryTable, warehouseStockLineTable, warehouseStockMovementTable } from "../schemas/warehouseStock.schema";
import { shipmentData } from "./shipmentFakes";

// Stock on Hand and the Bonded Register driven by the gate (needs migration 0018).

const { shipmentUpdate } = vi.hoisted(() => ({ shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})) }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: { usersList: vi.fn(async () => ({ users: [] })) },
  };
});

const user = randomUUID();
beforeEach(() => {
  shipmentUpdate.mockReset();
  shipmentUpdate.mockImplementation(async () => ({}));
});

const linesOf = (c: string, movementId: string) =>
  db.select().from(warehouseStockLineTable).where(and(eq(warehouseStockLineTable.companyId, c), eq(warehouseStockLineTable.movementId, movementId)));
const movesOf = (c: string, movementId: string) =>
  db.select().from(warehouseStockMovementTable).where(and(eq(warehouseStockMovementTable.companyId, c), eq(warehouseStockMovementTable.movementId, movementId)));
const entriesOf = (c: string, movementId: string) =>
  db.select().from(warehouseBondedEntryTable).where(and(eq(warehouseBondedEntryTable.companyId, c), eq(warehouseBondedEntryTable.movementId, movementId)));

// Inbound (příjem) LCL cargo up to its draft receipt and re-weigh.
async function inbound(input: Record<string, unknown> = {}) {
  const c = randomUUID();
  const m = await gateMovementService.create(c, user, { gateRef: "STOCK-1", handling: "Export", colli: 8, weightKg: 800, measureCbm: 3, ...input });
  await gateMovementService.stamp(m.id, c, user, "expDraft");
  await reweighService.record(m.id, c, user, { weighedKg: 805 });
  return { c, id: m.id };
}

describe("stock line from the gate", () => {
  it("the WH receipt opens one line (also when sent twice); the WH release closes it", async () => {
    const { c, id } = await inbound();
    expect(await linesOf(c, id)).toEqual([]);
    const req = { clientRequestId: randomUUID() };
    await gateMovementService.stampWithOutcome(id, c, user, "expReceipt", "user", req);
    const replay = await gateMovementService.stampWithOutcome(id, c, user, "expReceipt", "user", req);
    expect(replay.outcome).toBe("already_stamped");
    const [line, ...more] = await linesOf(c, id);
    expect(more).toEqual([]);
    expect(line).toMatchObject({ source: "auto", status: "Available", pieces: 8, weightKg: 800, cbm: 3, job: "STOCK-1" });
    expect((await movesOf(c, id)).map((r) => r.type)).toEqual(["Receipt"]);

    // Listed with the customs clock and the position; the house job cannot be changed here.
    const [item] = await stock.listStockLines(c);
    expect(item).toMatchObject({ source: "auto", movementId: id, closed: false, customsClock: { state: "none" } });
    await expect(stock.updateStockLine(line!.id, c, { pieces: 3 })).rejects.toThrow(/follows the gate record/);
    expect((await stock.updateStockLine(line!.id, c, { location: "a-04-2", status: "On hold" })).location).toBe("A-04-2");
    await expect(stock.deleteStockLine(line!.id, c)).rejects.toThrow(/closes when the position leaves/);

    await gateMovementService.override(id, c, user, "test release");
    await gateMovementService.stamp(id, c, user, "impRelease");
    const [closed] = await linesOf(c, id);
    expect(closed).toMatchObject({ status: "Picked", closedReason: "WH release", location: "A-04-2" });
    expect((await movesOf(c, id)).map((r) => r.type).sort()).toEqual(["Pick", "Receipt"]);
    expect(await stock.listStockLines(c, { openOnly: true })).toEqual([]);
  });

  it("parallel receipts make one line", async () => {
    const { c, id } = await inbound();
    await Promise.allSettled([gateMovementService.stamp(id, c, user, "expReceipt"), gateMovementService.stamp(id, c, user, "expReceipt")]);
    expect(await linesOf(c, id)).toHaveLength(1);
    expect(await movesOf(c, id)).toHaveLength(1);
  });

  it("a T1 position opens a bonded entry at the receipt; customs cleared discharges it", async () => {
    const { c, id } = await inbound({ customsMode: "T1", mrn: "26CZ5100001234A7" });
    await gateMovementService.stamp(id, c, user, "expReceipt");
    const [entry] = await entriesOf(c, id);
    expect(entry).toMatchObject({ source: "auto", regime: "Transit T1", mrn: "26CZ5100001234A7", balance: 8, dischargedAt: null });
    expect(entry!.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [b] = await stock.listBonded(c);
    expect(b).toMatchObject({ status: "In stock", customsClock: { regime: "Transit T1", state: "ok", daysUnderControl: 1 } });
    await expect(stock.deleteBonded(b!.id, c)).rejects.toThrow(/follows the gate record/);

    await gateMovementService.update(id, c, user, { customsStatus: "Customs Cleared/Released" });
    const [after] = await entriesOf(c, id);
    expect(after).toMatchObject({ balance: 0 });
    expect(after!.dischargeRef).toContain("customs cleared/released");
    expect((await linesOf(c, id))[0]).toMatchObject({ customs: "Export cleared", customsRegime: "" });
  });
});

describe("stripping tally", () => {
  it("the tick-off opens the line with the counted pieces and location; a voided tally voids it", async () => {
    const c = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
    const id = r!.movementId!;
    await gateMovementRepository.update(id, c, { colli: 10, weightKg: 1000 });
    const box = await records.createContainer(c, { number: "MSKU 611 902-7", equipment: "40' HC", direction: "Unloading" }, user);
    await containerService.addPositions(box.id, c, user, [id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await reweighService.record(id, c, user, { weighedKg: 1000 });
    await containerService.tally(box.id, c, user, "user", id, { outcome: "received", pieces: 9, location: "b-12" });
    const [line] = await linesOf(c, id);
    expect(line).toMatchObject({ source: "auto", pieces: 9, location: "B-12", job: r!.ref, status: "Available" });

    await containerService.voidTally(box.id, c, user, "manager", id, "wrong house");
    expect((await linesOf(c, id))[0]).toMatchObject({ status: "Voided" });
    await containerService.tally(box.id, c, user, "user", id, { outcome: "received", pieces: 10 });
    const again = await linesOf(c, id);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ status: "Available", pieces: 10, location: "B-12" });
    expect((await movesOf(c, id)).map((m) => m.type).sort()).toEqual(["Adjustment", "Adjustment", "Receipt"]);
  });
});

describe("manual lines and the manager build", () => {
  it("links a manual line by the picker; build skips positions with a manual line and counts the rest", async () => {
    const a = await inbound();
    const c = a.c;
    // Received before the sync existed: no line yet (simulated by removing nothing — a second position).
    const m2 = await gateMovementService.create(c, user, { gateRef: "STOCK-2", handling: "Export", operationType: "FCL" });
    await gateMovementService.stamp(m2.id, c, user, "expDraft");
    await gateMovementService.stamp(m2.id, c, user, "expReceipt");
    await gateMovementService.stamp(a.id, c, user, "expReceipt");
    // A manual line linked to a third, unreceived position, and one not linked.
    const m3 = await gateMovementService.create(c, user, { gateRef: "STOCK-3", handling: "Export" });
    const linked = await stock.createStockLine(c, { movementId: m3.id, receivedAt: "2026-10-01", pieces: 2 });
    expect(linked).toMatchObject({ source: "manual", movementId: m3.id, job: "STOCK-3" });
    await expect(stock.createStockLine(c, { movementId: randomUUID(), receivedAt: "2026-10-01" })).rejects.toThrow(/Position not found/);
    await expect(stock.createStockLine(c, { receivedAt: "2026-10-01" })).rejects.toThrow(/Pick the position/);
    expect((await stock.createStockLine(c, { job: "ODD-1", receivedAt: "2026-10-01" })).movementId).toBeNull();

    const dry = await stock.syncFromGate(c, user, true);
    expect(dry).toMatchObject({ dryRun: true, positions: 3, linesCreated: 0 });
    // Nothing missing: the stamps already made the lines. Repair: a manager build is a no-op.
    const run = await stock.syncFromGate(c, user, false);
    expect(run).toMatchObject({ dryRun: false, linesCreated: 0, linesClosed: 0 });
    expect(await linesOf(c, a.id)).toHaveLength(1);
    expect(await linesOf(c, m2.id)).toHaveLength(1);
  });
});

describe("stock line follows the manager's void, archive and restore", () => {
  it("a voided receipt voids the line, a new receipt reopens the same row; archive closes it and restore opens it again", async () => {
    const { c, id } = await inbound();
    await gateMovementService.stamp(id, c, user, "expReceipt");
    const [opened] = await linesOf(c, id);
    expect(opened).toMatchObject({ source: "auto", status: "Available" });

    await gateAdminService.voidStamp(id, c, user, "manager", "expReceipt", "stamped on the wrong position");
    const [voided, ...more] = await linesOf(c, id);
    expect(more).toEqual([]);
    expect(voided).toMatchObject({ id: opened!.id, status: "Voided" });
    expect(voided!.closedReason).toMatch(/wrong position/);

    await gateMovementService.stamp(id, c, user, "expReceipt");
    const [reopened] = await linesOf(c, id);
    expect(reopened).toMatchObject({ id: opened!.id, status: "Available", closedAt: null });

    await gateAdminService.archive(id, c, user, "manager", "duplicate record");
    const [archived] = await linesOf(c, id);
    expect(archived!.id).toBe(opened!.id);
    expect(archived!.closedAt).not.toBeNull();
    expect(await stock.listStockLines(c, { openOnly: true })).toEqual([]);

    await gateAdminService.restore(id, c, user, "manager", "was right after all");
    const [restored, ...again] = await linesOf(c, id);
    expect(again).toEqual([]);
    expect(restored).toMatchObject({ id: opened!.id, status: "Available", closedAt: null });
  });
});

describe("export container: stuffing, gate-out and its void", () => {
  it("stuffing allocates the line, un-stuffing frees it; the gate-out closes it as Load and discharges the bonded entry; a voided gate-out reopens the same rows", async () => {
    const c = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
    const id = r!.movementId!;
    await gateMovementRepository.update(id, c, { visit: "příjem", handling: "Export", colli: 4, weightKg: 2000, measureCbm: 6, customsMode: "T1", mrn: "26CZ5100009999A1" });
    await gateMovementService.stamp(id, c, user, "expDraft");
    await reweighService.record(id, c, user, { weighedKg: 2000 });
    await gateMovementService.stamp(id, c, user, "expReceipt");
    const [line] = await linesOf(c, id);
    const [entry] = await entriesOf(c, id);
    expect(line).toMatchObject({ status: "Available", consol: "" });
    expect(entry).toMatchObject({ regime: "Transit T1", balance: 4, dischargedAt: null });

    const box = await records.createContainer(c, { number: "TGHU 777 000-1", equipment: "20' DV", direction: "Loading" }, user);
    await containerService.addPositions(box.id, c, user, [id]);
    await containerService.stamp(box.id, c, user, "user", "gateIn");
    await containerService.setStuffed(box.id, c, user, id, true);
    expect((await linesOf(c, id))[0]).toMatchObject({ id: line!.id, status: "Allocated", consol: "TGHU 777 000-1" });
    await containerService.setStuffed(box.id, c, user, id, false);
    expect((await linesOf(c, id))[0]).toMatchObject({ id: line!.id, status: "Available", consol: "" });
    await containerService.setStuffed(box.id, c, user, id, true);
    await containerService.stamp(box.id, c, user, "user", "close", { seal: "S1" });
    await containerService.stamp(box.id, c, user, "user", "gateOut");

    const [gone, ...moreLines] = await linesOf(c, id);
    expect(moreLines).toEqual([]);
    expect(gone).toMatchObject({ id: line!.id, status: "Picked", closedReason: "Left in container TGHU 777 000-1" });
    const load = (await movesOf(c, id)).find((mv) => mv.type === "Load");
    expect(load).toMatchObject({ toLocation: "TGHU 777 000-1" });
    const [discharged, ...moreEntries] = await entriesOf(c, id);
    expect(moreEntries).toEqual([]);
    expect(discharged).toMatchObject({ id: entry!.id, balance: 0 });
    expect(discharged!.dischargedAt).not.toBeNull();
    expect(discharged!.dischargeRef).toContain("26CZ5100009999A1");
    expect(discharged!.dischargeRef).toContain("TGHU 777 000-1");

    await containerService.voidStamp(box.id, c, user, "manager", "gateOut", "wrong truck");
    const [back, ...noNewLine] = await linesOf(c, id);
    expect(noNewLine).toEqual([]);
    expect(back).toMatchObject({ id: line!.id, status: "Allocated", closedAt: null, consol: "TGHU 777 000-1" });
    const [reopened, ...noNewEntry] = await entriesOf(c, id);
    expect(noNewEntry).toEqual([]);
    expect(reopened).toMatchObject({ id: entry!.id, balance: 4, dischargedAt: null });
  });
});

describe("customs status from the shipment", () => {
  // Outbound T1 cargo received by its typed date (no container), linked to a shipment.
  async function bondedOutbound() {
    const c = randomUUID();
    const s = randomUUID();
    shipmentData.set(s, { customsProcedure: "T1", customsStatus: "Paperwork Verified" });
    const [r] = await warehouseImportService.importShipments(c, user, [s]);
    const id = r!.movementId!;
    await gateMovementService.update(id, c, user, { colli: 5, mrn: "26CZ5100001111A1", loadInDate: "2026-10-10" });
    const [entry] = await entriesOf(c, id);
    expect(entry).toMatchObject({ source: "auto", regime: "Transit T1", balance: 5, dischargedAt: null });
    return { c, s, id, entry: entry! };
  }

  it("the customs follow discharges the bonded entry when the shipment is cleared", async () => {
    const { c, s, id, entry } = await bondedOutbound();
    shipmentData.set(s, { customsProcedure: "T1", customsStatus: "Customs Cleared/Released" });
    const m = await gateMovementService.get(id, c, { follow: true, force: true });
    expect(m.customsStatus).toBe("Customs Cleared/Released");
    const [after] = await entriesOf(c, id);
    expect(after).toMatchObject({ id: entry.id, balance: 0 });
    expect(after!.dischargeRef).toContain("customs cleared/released");
    expect((await linesOf(c, id))[0]).toMatchObject({ customsRegime: "", customs: "Free circulation" });
  });

  it("Refresh from shipment discharges it too, in the same transaction as the change", async () => {
    const { c, s, id, entry } = await bondedOutbound();
    shipmentData.set(s, { customsProcedure: "T1", customsStatus: "Customs Cleared/Released" });
    const res = await warehouseImportService.refreshFromShipment(id, c, user);
    expect(res.changed).toContain("customs status");
    const [after] = await entriesOf(c, id);
    expect(after).toMatchObject({ id: entry.id, balance: 0 });
    expect(after!.dischargedAt).not.toBeNull();
  });
});

describe("a gate record saved as already received", () => {
  it("an outbound record created with a typed received date gets its stock line at once", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "STOCK-NEW", handling: "Import", visit: "výdej", colli: 3, loadInDate: "2026-10-10" });
    const [line, ...more] = await linesOf(c, m.id);
    expect(more).toEqual([]);
    expect(line).toMatchObject({ source: "auto", status: "Available", pieces: 3, receivedAt: "2026-10-10" });
    // Not received (inbound, nothing stamped): nothing made.
    const n = await gateMovementService.create(c, user, { gateRef: "STOCK-NEW-2", handling: "Export" });
    expect(await linesOf(c, n.id)).toEqual([]);
  });
});
