import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildReportSummary, warehouseRecordsService as svc } from "../services/warehouseRecords.service";
import { gateMovementService } from "../services/gateMovement.service";
import type { GateMovementRow } from "../repositories/gateMovement.repository";

const user = randomUUID();

describe("container register", () => {
  it("belongs to a position, shows its reference and customer, and feeds the survey container list", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091601", customer: "Alpine Trading", handling: "Import" });
    const created = await svc.createContainer(c, {
      movementId: m.id,
      number: "mscu 611 902-7",
      equipment: "40' HC",
      tareKg: 3750,
      cargoKg: 14820,
      gatedIn: "2026-09-10",
      gatedOut: "2026-09-14",
    });
    expect(created).toMatchObject({ number: "MSCU 611 902-7", customer: "Alpine Trading", handling: "Import", vgmKg: 18570, daysOnYard: 4 });
    expect((await gateMovementService.get(m.id, c)).containers).toEqual([{ id: created.id, number: "MSCU 611 902-7", type: "40' HC" }]);

    const updated = await svc.updateContainer(created.id, c, { seal: "CZ0084412", gatedOut: "" });
    expect(updated.seal).toBe("CZ0084412");
    expect(updated.daysOnYard).toBeGreaterThan(4);

    await expect(svc.updateContainer(created.id, c, { gatedIn: "10.9.2026" })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(svc.createContainer(c, { number: " " })).rejects.toThrow(/required/);
    await expect(svc.updateContainer(created.id, randomUUID(), { seal: "x" })).rejects.toThrow(/not found/);

    await svc.deleteContainer(created.id, c);
    expect(await svc.listContainers(c)).toEqual([]);
    expect((await gateMovementService.get(m.id, c)).containers).toEqual([]);
  });
});

describe("dock slots, roster, equipment, report library", () => {
  it("validate what they need and stay per company", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ2026091601", customer: "Alpine Trading", handling: "Export" });
    const slot = await svc.createDockSlot(c, { movementId: m.id, date: "2026-09-16", time: "09:00", dock: "Dock 4", direction: "IN", reference: "WCZ2026091601" });
    expect(slot.status).toBe("Booked");
    await expect(svc.createDockSlot(c, { date: "2026-09-16", time: "11:00", dock: "Dock 1" })).rejects.toThrow(/Pick the position/);
    await expect(svc.createDockSlot(c, { date: "2026-09-16", time: "9", dock: "Dock 1" })).rejects.toThrow(/HH:MM/);
    await expect(svc.updateDockSlot(slot.id, c, { direction: "UP" })).rejects.toThrow(/IN or OUT/);
    expect(await svc.listDockSlots(randomUUID())).toEqual([]);

    await expect(svc.createStaff(c, { name: "" })).rejects.toThrow(/Name/);
    expect((await svc.createStaff(c, { name: "J. Dvořák", role: "Receiving / WR", shift: "06:00–14:00" })).name).toBe("J. Dvořák");
    expect((await svc.createEquipment(c, { code: "FL-01", kind: "Forklift 2.5 t" })).status).toBe("Available");
    expect((await svc.createSavedReport(c, { name: "Daily stock position", format: "XLSX" })).format).toBe("XLSX");
  });
});

describe("claims", () => {
  it("are numbered CL-YY-#### without reusing deleted numbers", async () => {
    const c = randomUUID();
    const now = new Date("2026-09-16T10:00:00Z");
    const a = await svc.createClaim(c, { against: "Origin agent", type: "Short landed" }, now);
    const b = await svc.createClaim(c, { type: "Damage" }, now);
    expect([a.ref, b.ref]).toEqual(["CL-26-0001", "CL-26-0002"]);
    expect(a.raised).toBe("2026-09-16");
    await svc.deleteClaim(b.id, c);
    expect((await svc.createClaim(c, {}, now)).ref).toBe("CL-26-0003");
  });

  it("never repeat when created at the same time", async () => {
    const c = randomUUID();
    const now = new Date("2026-09-16T10:00:00Z");
    const claims = await Promise.all(Array.from({ length: 10 }, () => svc.createClaim(c, {}, now)));
    expect(claims.map((x) => x.ref).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `CL-26-${String(i + 1).padStart(4, "0")}`));
  });
});

describe("report summary", () => {
  const movement = (over: Partial<GateMovementRow>): GateMovementRow =>
    ({ customer: "", measureCbm: 0, weightKg: 0, loadType: "", operationType: "", colli: 0, surveys: [], gateIn: null, gateOut: null, impRelease: null, loadInDate: "", ...over }) as GateMovementRow;

  it("calculates throughput, top customers, monthly figures, lane fill and quality", () => {
    const now = new Date("2026-09-16T10:00:00Z"); // week 38
    const movements = [
      movement({ customer: "RAVAK", measureCbm: 10, weightKg: 12000, loadType: "Consolidation", gateIn: new Date("2026-09-15T08:00:00Z"), colli: 10, surveys: [{ damaged: 2, surveyedAt: "2026-09-15T09:00:00Z" } as never] }),
      movement({ customer: "RAVAK", measureCbm: 5, gateIn: new Date("2026-09-02T08:00:00Z"), gateOut: new Date("2026-09-15T08:00:00Z") }),
      movement({ customer: "Zetor", measureCbm: 15, loadInDate: "2026-09-01", operationType: "FCL stripping" }),
      movement({ customer: "Old", measureCbm: 7, loadInDate: "2026-08-20" }),
    ];
    const containers = [
      { direction: "Loading", equipment: "40' HC", cbm: 57, pieces: 20, dischargePort: "Jebel Ali", gatedIn: "2026-09-10", gatedOut: "2026-09-12", createdAt: now },
      { direction: "Loading", equipment: "20' DV", cbm: 15.5, pieces: 4, dischargePort: "Durban", gatedIn: "", gatedOut: "", createdAt: now },
    ] as never[];
    const slots = [
      { direction: "OUT", status: "Completed" },
      { direction: "OUT", status: "Overdue" },
      { direction: "IN", status: "Completed" },
    ] as never[];

    const r = buildReportSummary(movements, containers, slots, now);

    expect(r.throughput).toHaveLength(8);
    expect(r.throughput.at(-1)).toEqual({ week: "W38", receivedCbm: 10, dispatchedCbm: 5 });
    expect(r.topCustomers).toEqual([
      { customer: "RAVAK", jobs: 2, cbm: 15, wm: 17, share: 50 },
      { customer: "Zetor", jobs: 1, cbm: 15, wm: 15, share: 50 },
    ]);
    expect(r.monthly[0]).toMatchObject({ month: "2026-09", monthToDate: true, receipts: 3, cbmIn: 30, dispatches: 1, cbmOut: 5, consolPositions: 1, fclStripped: 1, containersLoaded: 1, yardContainerDays: 2 });
    expect(r.monthly[1]).toMatchObject({ month: "2026-08", receipts: 1, cbmIn: 7 });
    expect(r.lanes).toEqual([
      { lane: "Durban", containers: 1, avgCbm: 15.5, capacityCbm: 31, fill: 50, avgPieces: 4, verdict: "Below target" },
      { lane: "Jebel Ali", containers: 1, avgCbm: 57, capacityCbm: 76, fill: 75, avgPieces: 20, verdict: "Acceptable" },
    ]);
    expect(r.quality).toEqual({ surveyedPieces: 10, damagedPieces: 2, damageRate: 20, onTimeDispatch: 50 });
  });
});
