import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { stockLineItem, warehouseStockService as svc, zoneItem } from "../services/warehouseStock.service";

const user = randomUUID();
const now = new Date("2026-08-20T09:00:00Z");

const line = (receivedAt: string, freeDays: number, cbm: number, weightKg: number) =>
  ({
    id: "x",
    companyId: "c",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    job: "WCZ2026081101",
    customer: "",
    shipper: "",
    pod: "",
    pieces: 1,
    packageType: "",
    weightKg,
    cbm,
    location: "A-04-2",
    receivedAt,
    freeDays,
    customs: "Free circulation",
    status: "Available",
    consol: "",
    marks: "",
  }) as Parameters<typeof stockLineItem>[0];

describe("stock on hand", () => {
  it("counts free time from the receipt date and accrues storage once it runs out", () => {
    // Received 13 days ago with 7 free days: 6 chargeable days at max(2.6 × 22, 120) = 120 CZK.
    expect(stockLineItem(line("2026-08-07", 7, 2.6, 1180), now)).toMatchObject({
      daysInStock: 13,
      overFreeTime: 6,
      freeTimeState: "Chargeable",
      lastFreeDay: "2026-08-14",
      chargeableDays: 6,
      accruedCzk: 720,
      wm: 2.6,
    });
    // w/m is the larger of cbm and tonnes; within the last 2 days of free time it is expiring.
    expect(stockLineItem(line("2026-08-15", 7, 2.9, 3980), now)).toMatchObject({ wm: 3.98, overFreeTime: -2, freeTimeState: "Expiring", accruedCzk: 0 });
    expect(stockLineItem(line("2026-08-19", 7, 1, 100), now).freeTimeState).toBe("Within free time");
  });

  it("validates lines and keeps them per company", async () => {
    const c = randomUUID();
    const created = await svc.createStockLine(c, { job: " WCZ2026082001 ", receivedAt: "2026-08-20", location: "a-04-2", pieces: 6, cbm: 5.4, weightKg: 2180 });
    expect(created).toMatchObject({ job: "WCZ2026082001", location: "A-04-2", status: "Available", customs: "Free circulation", freeDays: 7 });

    await expect(svc.createStockLine(c, { job: "X", receivedAt: "20.8.2026" })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(svc.updateStockLine(created.id, c, { status: "Lost" })).rejects.toThrow(/Status/);
    await expect(svc.updateStockLine(created.id, c, { pieces: -1 })).rejects.toThrow(/negative/);
    await expect(svc.updateStockLine(created.id, randomUUID(), { pieces: 2 })).rejects.toThrow(/not found/);

    expect((await svc.updateStockLine(created.id, c, { status: "Allocated", consol: "CZM0000231" })).status).toBe("Allocated");
    await svc.deleteStockLine(created.id, c);
    expect(await svc.listStockLines(c)).toEqual([]);
  });
});

describe("zones", () => {
  it("count occupancy from the stock lines located in them", async () => {
    const lines = [
      { location: "A-04-2", pieces: 6 },
      { location: "A-04-3", pieces: 5 },
      { location: "A-01-1", pieces: 2 },
      { location: "B-02-1", pieces: 12 },
    ];
    const zone = { id: "z", companyId: "c", deletedAt: null, createdAt: now, updatedAt: now, name: "", blockedBays: "", note: "" };
    expect(zoneItem({ ...zone, code: "A", bays: 18, capacity: 216 }, lines)).toMatchObject({ usedBays: 2, occupied: 13, fullPercent: 6 });
    // Floor zones (no pallet capacity) count bays instead.
    expect(zoneItem({ ...zone, code: "B", bays: 4, capacity: 0 }, lines)).toMatchObject({ usedBays: 1, occupied: 12, fullPercent: 25 });

    const c = randomUUID();
    const z = await svc.createZone(c, { code: "c", name: "Bonded cage (T1)", bays: 6, capacity: 48, blockedBays: "c-05, ,c-06" });
    expect(z).toMatchObject({ code: "C", blockedBays: "C-05, C-06", usedBays: 0 });
    await svc.createStockLine(c, { job: "WCZ2026082002", receivedAt: "2026-08-13", location: "C-02-2", pieces: 3 });
    expect((await svc.listZones(c))[0]).toMatchObject({ usedBays: 1, occupied: 3 });
  });
});

describe("movements and bonded register", () => {
  it("records movements with who and when, and discharges bonded entries by balance", async () => {
    const c = randomUUID();
    const m = await svc.recordMovement(c, user, { type: "Put-away", job: "WCZ2026082001", pieces: 6, fromLocation: "Dock 2", toLocation: "A-04-2" });
    expect(m.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    await expect(svc.recordMovement(c, user, { type: "Teleport" })).rejects.toThrow(/Movement type/);
    expect(await svc.listMovements(c)).toHaveLength(1);

    const entry = await svc.createBonded(c, { mrn: "26cz5100001234a7", job: "WCZ2026081301", entryDate: "2026-08-13", pieces: 3 });
    expect(entry).toMatchObject({ mrn: "26CZ5100001234A7", balance: 3, status: "In stock" });
    expect(await svc.updateBonded(entry.id, c, { balance: 0, discharge: "2026-08-20 · 40 00 release" })).toMatchObject({ status: "Discharged" });
    await expect(svc.createBonded(c, { mrn: " " })).rejects.toThrow(/required/);
  });
});
