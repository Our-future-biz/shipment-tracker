import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { movementStorage, storageClock, storageNote, type StorageMovement } from "../services/storage";
import { gateMovementService } from "../services/gateMovement.service";
import { warehouseImportService } from "../services/warehouseImport.service";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
const inbound = (p: Partial<StorageMovement>): StorageMovement => ({
  visit: "příjem",
  gateIn: null,
  gateOut: null,
  impRelease: null,
  loadInDate: "",
  freeDays: null,
  measureCbm: 1,
  weightKg: 100,
  ...p,
});

describe("storage clock", () => {
  it("counts calendar days with the arrival day as day 1", () => {
    expect(storageClock({ start: "2026-10-14", wm: 1, today: "2026-10-14" })).toMatchObject({
      daysInWarehouse: 1,
      freeDays: 7,
      freeDaysLeft: 6,
      lastFreeDay: "2026-10-20",
      chargeableDays: 0,
      state: "Within free time",
    });
  });

  it("makes day 7 the last free day and charges from day 8, at least CZK 120 a day", () => {
    const day7 = storageClock({ start: "2026-10-01", wm: 2, today: "2026-10-07" });
    expect(day7).toMatchObject({ daysInWarehouse: 7, freeDaysLeft: 0, chargeableDays: 0, estimatedCzk: 0, state: "Expiring" });
    expect(storageClock({ start: "2026-10-01", wm: 2, today: "2026-10-05" }).state).toBe("Expiring"); // 2 days left
    expect(storageClock({ start: "2026-10-01", wm: 2, today: "2026-10-04" }).state).toBe("Within free time"); // 3 days left
    expect(storageClock({ start: "2026-10-01", wm: 2, today: "2026-10-08" })).toMatchObject({ chargeableDays: 1, dailyCzk: 120, estimatedCzk: 120, state: "Chargeable" });
    // W/M 10: 10 × 22 = CZK 220 a day.
    expect(storageClock({ start: "2026-10-01", wm: 10, today: "2026-10-10" })).toMatchObject({ chargeableDays: 3, dailyCzk: 220, estimatedCzk: 660 });
  });

  it("uses the position's own free days, and is not started without a receipt date", () => {
    expect(storageClock({ start: "2026-10-01", freeDays: 3, wm: 1, today: "2026-10-05" })).toMatchObject({ freeDays: 3, chargeableDays: 2, lastFreeDay: "2026-10-03" });
    expect(storageClock({ start: "2026-10-01", freeDays: 0, wm: 1, today: "2026-10-01" })).toMatchObject({ chargeableDays: 1, estimatedCzk: 120 });
    expect(storageClock({ start: "", wm: 1, today: "2026-10-05" })).toMatchObject({ started: false, daysInWarehouse: 0, state: "Not started", estimatedCzk: 0 });
    expect(storageClock({ start: "1.10.2026", wm: 1, today: "2026-10-05" }).state).toBe("Not started");
  });

  it("uses Prague dates, also across midnight and the change to winter time", () => {
    // 22:30 UTC on 10-14 is 00:30 on 10-15 in Prague (summer time).
    expect(movementStorage(inbound({ gateIn: new Date("2026-10-14T22:30:00Z") }), new Date("2026-10-15T08:00:00Z"))).toMatchObject({
      startDate: "2026-10-15",
      daysInWarehouse: 1,
    });
    // 25 Oct 2026 is the day clocks go back: 22:30 UTC on 10-24 is 00:30 CEST on 10-25, and
    // 23:30 UTC on 10-25 is 00:30 CET on 10-26.
    expect(movementStorage(inbound({ gateIn: new Date("2026-10-24T22:30:00Z") }), new Date("2026-10-25T23:30:00Z"))).toMatchObject({
      startDate: "2026-10-25",
      daysInWarehouse: 2,
    });
    expect(movementStorage(inbound({ gateIn: new Date("2026-10-24T21:30:00Z") }), new Date("2026-10-25T22:59:00Z")).daysInWarehouse).toBe(2);
  });

  it("stops at the WH release; an inbound gate-out (the delivering truck) does not stop it", () => {
    const now = new Date("2026-11-30T10:00:00Z");
    const released = movementStorage(
      inbound({ gateIn: new Date("2026-10-01T08:00:00Z"), impRelease: new Date("2026-10-09T08:00:00Z"), gateOut: new Date("2026-10-12T08:00:00Z") }),
      now,
    );
    expect(released).toMatchObject({ stopped: true, stopDate: "2026-10-09", daysInWarehouse: 9, chargeableDays: 2, estimatedCzk: 240 });
    // Inbound: the truck left on 10-03, the cargo is still in the warehouse on 11-30 (day 61).
    expect(movementStorage(inbound({ gateIn: new Date("2026-10-01T08:00:00Z"), gateOut: new Date("2026-10-03T08:00:00Z") }), now)).toMatchObject({
      stopped: false,
      stopDate: "",
      daysInWarehouse: 61,
      state: "Chargeable",
    });
    // Outbound: the gate-out stops the clock when there is no WH release (and the release first).
    const out = (p: Partial<StorageMovement>) => movementStorage(inbound({ visit: "výdej", loadInDate: "2026-10-01", ...p }), now);
    expect(out({ gateOut: new Date("2026-10-03T08:00:00Z") })).toMatchObject({ stopped: true, stopDate: "2026-10-03", daysInWarehouse: 3 });
    expect(out({ impRelease: new Date("2026-10-02T08:00:00Z"), gateOut: new Date("2026-10-03T08:00:00Z") })).toMatchObject({ stopDate: "2026-10-02", daysInWarehouse: 2 });
  });

  it("starts outbound cargo at its received-in-warehouse date, never at the truck's gate-in", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    const out = (p: Partial<StorageMovement>) => movementStorage(inbound({ visit: "výdej", ...p }), now);
    expect(out({ gateIn: new Date("2026-10-01T08:00:00Z") })).toMatchObject({ started: false, state: "Not started", startSource: "" });
    expect(out({ gateIn: new Date("2026-10-01T08:00:00Z"), loadInDate: "2026-10-10" })).toMatchObject({
      startDate: "2026-10-10",
      startSource: "loadInDate",
      daysInWarehouse: 5,
    });
    expect(movementStorage(inbound({ gateIn: new Date("2026-10-13T08:00:00Z") }), now).startSource).toBe("gateIn");
  });

  it("writes the Storage settled note", () => {
    expect(storageNote(storageClock({ start: "2026-10-01", wm: 1, today: "2026-10-09" }))).toBe("day 9 · 7 free · 2 chargeable · est. CZK 240");
    expect(storageNote(storageClock({ start: "2026-10-01", wm: 1, today: "2026-10-06" }))).toBe("day 6 · 7 free · 1 free day left");
    expect(storageNote(storageClock({ start: null, wm: 1, today: "2026-10-06" }))).toBe("not started · 7 free days");
  });
});

describe("storage on the gate record", () => {
  it("shows the clock on the record and the Storage settled line, and logs the received date and free days", async () => {
    const c = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
    let m = await gateMovementService.get(r!.movementId!, c);
    expect(m.visit).toBe("výdej");
    expect(m.storage).toMatchObject({ started: false, state: "Not started" });
    expect(m.releaseGates.find((g) => g.g === "Storage settled")!.note).toBe("not started · 7 free days");

    m = await gateMovementService.update(m.id, c, user, { loadInDate: "2026-10-01", freeDays: 5 });
    expect(m.storage).toMatchObject({ started: true, startDate: "2026-10-01", startSource: "loadInDate", freeDays: 5 });
    expect(m.releaseGates.find((g) => g.g === "Storage settled")!.note).toMatch(/^day \d+ · 5 free/);
    // Only the shown note follows the clock; the stored line keeps its own (and its tick).
    expect(m.releaseGates.find((g) => g.g === "Storage settled")!.s).toBe("OK");
    expect(m.events.filter((e) => e.kind === "storageClockChanged").map((e) => e.label)).toEqual(["Received in warehouse: 2026-10-01", "Free days: 5"]);

    await expect(gateMovementService.update(m.id, c, user, { loadInDate: "1.10.2026" })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(gateMovementService.update(m.id, c, user, { freeDays: -1 })).rejects.toThrow(/Free days/);
    m = await gateMovementService.update(m.id, c, user, { freeDays: null });
    expect(m.storage.freeDays).toBe(7);
  });
});
