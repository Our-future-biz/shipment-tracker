import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { kpiService } from "../services/kpi.service";
import { pragueDate } from "../services/storage";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();

describe("Reports KPIs (database)", () => {
  it("count a real receipt and WH release of the company only", async () => {
    const c = randomUUID();
    const { movement } = await warehouseImportService.createPosition(c, user, {
      handling: "Export",
      operationType: "FCL stuffing",
      customsStatus: "Customs Cleared/Released",
      colli: 10,
      weightKg: 1000,
      measureCbm: 4,
    });
    await gateMovementRepository.update(movement.id, c, { releaseGates: movement.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
    for (const kind of ["gateIn", "expDraft", "expReceipt", "impRelease"] as const) await gateMovementService.stamp(movement.id, c, user, kind);

    const today = pragueDate(new Date());
    const r = await kpiService.report(c, { from: today, to: today });
    const k = (key: string) => r.kpis.find((x) => x.key === key)!;
    expect(r.period).toMatchObject({ from: today, to: today, days: 1, bucket: "day" });
    expect(k("throughput")).toMatchObject({ value: 1 });
    expect(r.throughput).toEqual([expect.objectContaining({ inPositions: 1, inPieces: 10, inKg: 1000, inCbm: 4, outPositions: 1 })]);
    expect(k("dwell").n).toBe(1);
    expect(k("receiptToRelease").n).toBe(1);
    expect(k("gateToReceipt").n).toBe(1);
    expect(k("onTime")).toMatchObject({ value: null });

    const other = await kpiService.report(randomUUID(), { from: today, to: today });
    expect(other.kpis.find((x) => x.key === "throughput")!.value).toBe(0);
  });

  it("refuses a period it cannot use", async () => {
    await expect(kpiService.report(randomUUID(), { from: "2026-10-10", to: "2026-10-01" })).rejects.toThrow(/starts after/);
    await expect(kpiService.report(randomUUID(), { from: "2024-01-01", to: "2026-10-01" })).rejects.toThrow(/366/);
  });
});
