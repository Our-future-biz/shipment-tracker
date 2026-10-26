import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { gatePartiesService } from "../services/gateParties.service";
import { gateMovementService } from "../services/gateMovement.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { warehouseRecordsService as records } from "../services/warehouseRecords.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { dockSlotRepository } from "../repositories/warehouseRecords.repository";
import { warehouseBondedEntryTable, warehouseStockLineTable } from "../schemas/warehouseStock.schema";
import type { Shipment } from "../services/warehouseImport.service";
import { failingShipments, fakeShipment, notFound, shipmentData } from "./shipmentFakes";

// A gate record follows its shipment's Customer and Customer's PIC (shipment-parties-changed →
// gatePartiesService.follow, and the customs follow's read as the self-heal): the record, its stock
// line and bonded entry, and the dock slots that showed the old customer. The event is only a
// signal — the shipment is read under its turn, so a late event never writes an older name.

const { shipmentGet, internalServiceUser } = vi.hoisted(() => ({
  shipmentGet: vi.fn(),
  internalServiceUser: vi.fn(async () => ({ userId: "svc-warehouse" })),
}));
vi.mock("~encore/clients", async () => ({
  shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet },
  auth: { ...(await import("./authFake")).authFake([]), _internalServiceUser: internalServiceUser },
}));

const user = randomUUID();
const DAY = "2026-11-20";
// Outbound T1 cargo: received by its typed date, so it has a stock line and a bonded entry.
const BASE: Partial<Shipment> = { customsProcedure: "T1", customsStatus: "Paperwork Verified", customer: "Ravak", customerPic: "Petr" };

beforeEach(async () => {
  const { getShipment } = await import("./shipmentFakes");
  shipmentGet.mockReset();
  shipmentGet.mockImplementation(getShipment);
});

const lineOf = async (c: string, id: string) =>
  (await db.select().from(warehouseStockLineTable).where(and(eq(warehouseStockLineTable.companyId, c), eq(warehouseStockLineTable.movementId, id))))[0];
const entryOf = async (c: string, id: string) =>
  (await db.select().from(warehouseBondedEntryTable).where(and(eq(warehouseBondedEntryTable.companyId, c), eq(warehouseBondedEntryTable.movementId, id))))[0];
const partiesOfSlots = async (c: string, id: string) => (await dockSlotRepository.listForMovements([id], c)).map((s) => s.party);
const rename = (s: string, parties: Partial<Shipment>) => shipmentData.set(s, { ...BASE, ...parties });

// A shipment's record with a stock line, a bonded entry and two dock slots: one showing the
// customer (copied when booked), one with a party typed on it. Each on doors of its own.
let doors = 0;
async function linked(c = randomUUID()) {
  const s = randomUUID();
  shipmentData.set(s, BASE);
  const [r] = await warehouseImportService.importShipments(c, user, [s]);
  const id = r!.movementId!;
  await gateMovementService.update(id, c, user, { colli: 5, mrn: "26CZ5100001111A1", loadInDate: "2026-10-10" });
  await records.createDockSlot(c, { movementId: id, date: DAY, time: "08:00", dock: `Dock ${++doors}` });
  await records.createDockSlot(c, { movementId: id, date: DAY, time: "10:00", dock: `Dock ${++doors}`, party: "Haulier Novák" });
  expect(await partiesOfSlots(c, id)).toEqual(["Ravak", "Haulier Novák"]);
  expect((await lineOf(c, id))?.customer).toBe("Ravak");
  expect((await entryOf(c, id))?.consignee).toBe("Ravak");
  shipmentGet.mockClear();
  return { c, s, id, ref: r!.ref };
}

describe("follow(): the shipment's current parties reach its gate records", () => {
  it("updates the record, its stock line and bonded entry and the slot that showed the old customer; a typed party stays", async () => {
    const { c, s, id } = await linked();
    rename(s, { customer: "RAVAK a.s.", customerPic: "Petr Masák" });
    const r = await gatePartiesService.follow(c, s);
    expect(r.shipmentDeleted).toBe(false);
    expect(r.changed.map((m) => m.id)).toEqual([id]);
    // Read as the company's service identity: there is no user behind an event.
    expect(shipmentGet).toHaveBeenCalledWith({ shipmentId: s }, { authData: { userID: "svc-warehouse", companyID: c, role: "user" } });

    const m = await gateMovementService.get(id, c);
    expect(m).toMatchObject({ customer: "RAVAK a.s.", customerContact: "Petr Masák" });
    expect(m.events.at(-1)).toMatchObject({
      kind: "refreshedFromShipment",
      label: "Customer updated from the shipment",
      by: "Shipment",
      detail: 'Customer: "Ravak" → "RAVAK a.s."; Customer contact: "Petr" → "Petr Masák"',
    });
    expect((await lineOf(c, id))?.customer).toBe("RAVAK a.s.");
    expect((await entryOf(c, id))?.consignee).toBe("RAVAK a.s.");
    expect(await partiesOfSlots(c, id)).toEqual(["RAVAK a.s.", "Haulier Novák"]);
  });

  it("a repeated event changes nothing", async () => {
    const { c, s, id } = await linked();
    rename(s, { customer: "RAVAK a.s." });
    await gatePartiesService.follow(c, s);
    const before = await gateMovementService.get(id, c);
    const again = await gatePartiesService.follow(c, s);
    expect(again.changed).toEqual([]);
    const after = await gateMovementService.get(id, c);
    expect(after.events).toHaveLength(before.events.length);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("a stale event after a newer one does not bring the old name back (the shipment is read under its turn)", async () => {
    const { c, s, id } = await linked();
    rename(s, { customer: "Ravak 2" });
    // The first handler's read of Shipments is slow; the shipment is renamed again meanwhile and
    // the second handler starts. Had either read before its turn, the slow one would win.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reading!: () => void;
    const readStarted = new Promise<void>((resolve) => (reading = resolve));
    shipmentGet.mockImplementationOnce(async ({ shipmentId }: { shipmentId: string }) => {
      const shipment = fakeShipment(shipmentId);
      reading();
      await held;
      return { shipment };
    });
    const first = gatePartiesService.follow(c, s);
    await readStarted;
    rename(s, { customer: "Ravak 3" });
    const second = gatePartiesService.follow(c, s);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await Promise.all([first, second]);
    expect((await gateMovementService.get(id, c)).customer).toBe("Ravak 3");

    // A late delivery of the event about "Ravak 2" changes nothing either.
    expect((await gatePartiesService.follow(c, s)).changed).toEqual([]);
    expect((await gateMovementService.get(id, c)).customer).toBe("Ravak 3");
    expect(await partiesOfSlots(c, id)).toEqual(["Ravak 3", "Haulier Novák"]);
  });

  it("a deleted shipment changes nothing; a failed read is thrown (delivered again)", async () => {
    const { c, s, id } = await linked();
    failingShipments.set(s, notFound());
    expect(await gatePartiesService.follow(c, s)).toEqual({ changed: [], shipmentDeleted: true });
    failingShipments.set(s, new Error("shipments unavailable"));
    await expect(gatePartiesService.follow(c, s)).rejects.toThrow(/unavailable/);
    failingShipments.delete(s);
    expect((await gateMovementService.get(id, c)).customer).toBe("Ravak");
  });

  it("does not ask Shipments about a shipment that is not in the warehouse", async () => {
    expect(await gatePartiesService.follow(randomUUID(), randomUUID())).toEqual({ changed: [], shipmentDeleted: false });
    expect(shipmentGet).not.toHaveBeenCalled();
  });
});

describe("the same rule elsewhere", () => {
  it("the customs follow's read catches a missed event (or a record imported with an older name)", async () => {
    const { c, s, id } = await linked();
    rename(s, { customer: "RAVAK a.s.", customerPic: "Jana" });
    await gateMovementRepository.markShipmentChecked([id], c, new Date(Date.now() - 60 * 60_000));
    expect(await gateMovementService.followShipments(c, { asService: true })).toBe(1);
    const m = await gateMovementService.get(id, c);
    expect(m).toMatchObject({ customer: "RAVAK a.s.", customerContact: "Jana" });
    expect(m.events.some((e) => e.label === "Customer updated from the shipment" && e.by === "Shipment")).toBe(true);
    expect((await lineOf(c, id))?.customer).toBe("RAVAK a.s.");
    expect(await partiesOfSlots(c, id)).toEqual(["RAVAK a.s.", "Haulier Novák"]);
  });

  it("a customer changed at the gate takes the slot that showed the old one along", async () => {
    const { c, id } = await linked();
    await gateMovementService.update(id, c, user, { customer: "Typed at the gate" });
    expect(await partiesOfSlots(c, id)).toEqual(["Typed at the gate", "Haulier Novák"]);
  });

  it("Refresh from shipment does the same", async () => {
    const { c, s, id } = await linked();
    rename(s, { customer: "Refreshed Customer" });
    const res = await warehouseImportService.refreshFromShipment(id, c, user);
    expect(res.changed).toContain("customer");
    expect(await partiesOfSlots(c, id)).toEqual(["Refreshed Customer", "Haulier Novák"]);
  });
});

describe("links backfill (normalize)", () => {
  it("brings records up to date, and reports deleted and unreadable shipments by job number and position", async () => {
    const c = randomUUID();
    const ok = await linked(c);
    const gone = await linked(c);
    const broken = await linked(c);
    rename(ok.s, { customer: "RAVAK a.s." });
    failingShipments.set(gone.s, notFound());
    failingShipments.set(broken.s, new Error("shipments unavailable"));
    try {
      const res = await gatePartiesService.normalize(c);
      expect(res.checked).toBe(3);
      expect(res.changed).toBe(1);
      expect(res.unmatched).toEqual([
        { field: "shipment deleted", value: `SEA-${gone.s.slice(0, 6)} (${gone.ref})`, count: 1 },
        { field: "shipment could not be read", value: `SEA-${broken.s.slice(0, 6)} (${broken.ref})`, count: 1 },
      ]);
      expect((await gateMovementService.get(ok.id, c)).customer).toBe("RAVAK a.s.");
      // Running it again changes nothing more.
      expect((await gatePartiesService.normalize(c)).changed).toBe(0);
    } finally {
      failingShipments.delete(gone.s);
      failingShipments.delete(broken.s);
    }
  });
});
