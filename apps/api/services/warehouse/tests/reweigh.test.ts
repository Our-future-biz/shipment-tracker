import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { reweighService } from "../services/reweigh.service";
import { warehouseService } from "../services/warehouse.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { needsReweigh, reweighVariance } from "../services/reweigh";
import { shipmentData } from "./shipmentFakes";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: { usersList: vi.fn(async () => ({ users: [] })) },
  };
});

const user = randomUUID();
afterEach(() => vi.useRealTimers());

// An inbound (příjem) position linked to a shipment declaring 1.2 t, arrived (draft receipt).
async function arrived(operationType = "LCL consolidation") {
  const c = randomUUID();
  const shipmentId = randomUUID();
  shipmentData.set(shipmentId, { totalWeightTons: "1.2" } as never);
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  const id = r!.movementId!;
  await gateMovementRepository.update(id, c, { visit: "příjem", handling: "Export", operationType, weightKg: 1000 });
  return { c, id, taskId: r!.taskId! };
}

describe("LCL re-weigh rule", () => {
  it("applies to LCL and consolidation, never to FCL", () => {
    expect(needsReweigh({ operationType: "LCL consolidation", loadType: "" })).toBe(true);
    expect(needsReweigh({ operationType: "Cargo storage", loadType: "Consolidation" })).toBe(true);
    expect(needsReweigh({ operationType: "Cargo storage", loadType: "" })).toBe(false);
    expect(needsReweigh({ operationType: "FCL stuffing", loadType: "Consolidation" })).toBe(false);
    expect(needsReweigh({ operationType: "Container yard", loadType: "" })).toBe(false);
  });

  it("flags more than 5 % either way", () => {
    expect(reweighVariance(1050, 1000)).toEqual({ pct: 0.05, flagged: false });
    expect(reweighVariance(1062, 1000)).toEqual({ pct: 0.062, flagged: true });
    expect(reweighVariance(940, 1000)).toEqual({ pct: -0.06, flagged: true });
    expect(reweighVariance(1000, null)).toEqual({ pct: null, flagged: false });
  });
});

describe("re-weighing a position", () => {
  it("refuses a bad weight and cargo that has not arrived", async () => {
    const { c, id } = await arrived();
    for (const weighedKg of [0, -5, Number.NaN, 100_001]) {
      await expect(reweighService.record(id, c, user, { weighedKg })).rejects.toThrow(/above 0/);
    }
    await expect(reweighService.record(id, c, user, { weighedKg: 1000 })).rejects.toThrow(/not arrived yet/);
  });

  it("is required before the WH receipt of LCL cargo, not of FCL cargo", async () => {
    const lcl = await arrived();
    await gateMovementService.stamp(lcl.id, lcl.c, user, "expDraft");
    const draft = await gateMovementService.get(lcl.id, lcl.c);
    expect(draft).toMatchObject({ needsReweigh: true, reweigh: null });
    await expect(gateMovementService.stamp(lcl.id, lcl.c, user, "expReceipt")).rejects.toThrow(/re-weighed before the receipt/);
    const res = await reweighService.record(lcl.id, lcl.c, user, { weighedKg: 1290, note: "scale 2" });
    expect(res.outcome).toBe("recorded");
    expect(res.notice).toMatch(/More than 5 %/);
    expect(res.movement.reweigh).toMatchObject({ weighedKg: 1290, declaredKg: 1200, declaredSource: "shipment", variancePct: 0.075, flagged: true, note: "scale 2" });
    expect(res.movement.checklist.vgm).toBe("g");
    expect(res.movement.events.at(-1)).toMatchObject({ kind: "reweighed", label: "Re-weighed 1 290 kg (declared 1 200 kg · +7.5 % — variance)" });
    expect((await gateMovementService.stamp(lcl.id, lcl.c, user, "expReceipt")).expReceipt).not.toBeNull();

    const fcl = await arrived("FCL stuffing");
    await gateMovementService.stamp(fcl.id, fcl.c, user, "expDraft");
    expect((await gateMovementService.get(fcl.id, fcl.c)).needsReweigh).toBe(false);
    expect((await gateMovementService.stamp(fcl.id, fcl.c, user, "expReceipt")).expReceipt).not.toBeNull();
  });

  it("keeps the history: a correction is a new weighing and the latest counts", async () => {
    const { c, id } = await arrived();
    await gateMovementService.stamp(id, c, user, "gateIn", "user", { recordedAt: new Date(Date.now() - 10 * 60_000).toISOString(), clientRequestId: randomUUID() });
    await reweighService.record(id, c, user, { weighedKg: 1300 });
    const again = await reweighService.record(id, c, user, { weighedKg: 1210 });
    expect(again.movement.reweigh).toMatchObject({ weighedKg: 1210, flagged: false });
    expect(again.movement.reweighs.map((r) => r.weighedKg)).toEqual([1210, 1300]);
    expect(again.movement.events.at(-1)).toMatchObject({ label: expect.stringMatching(/^Re-weighed again 1 210 kg/), detail: "was 1 300 kg" });
    // An older weighing sent late from a phone is kept in history; the newer one still counts.
    const late = await reweighService.record(id, c, user, { weighedKg: 900, recordedAt: new Date(Date.now() - 60_000).toISOString(), clientRequestId: randomUUID() });
    expect(late.notice).toMatch(/newer re-weigh counts/);
    expect(late.movement.reweigh!.weighedKg).toBe(1210);
    expect(late.movement.reweighs).toHaveLength(3);
  });

  it("records a weighing sent twice from the offline queue once", async () => {
    const { c, id } = await arrived();
    await gateMovementService.stamp(id, c, user, "gateIn");
    const req = { weighedKg: 1180, recordedAt: new Date().toISOString(), clientRequestId: randomUUID() };
    const [a, b] = await Promise.all([reweighService.record(id, c, user, req), reweighService.record(id, c, user, req)]);
    expect([a.outcome, b.outcome].sort()).toEqual(["already_recorded", "recorded"]);
    const m = await gateMovementService.get(id, c);
    expect(m.reweighs).toHaveLength(1);
    expect(m.events.filter((e) => e.kind === "reweighed")).toHaveLength(1);
    await expect(reweighService.record(id, c, user, { weighedKg: 1, recordedAt: new Date(Date.now() - 13 * 3600_000).toISOString() })).rejects.toThrow(/12 hours/);
  });

  it("uses the gate figures when the position has no shipment", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "WCZ-T", handling: "Export", visit: "příjem", weightKg: 500 });
    await gateMovementService.stamp(m.id, c, user, "gateIn");
    const res = await reweighService.record(m.id, c, user, { weighedKg: 520 });
    expect(res.movement.reweigh).toMatchObject({ declaredKg: 500, declaredSource: "gate", variancePct: 0.04, flagged: false });
  });

  it("carries the re-weighed weight into Mark VGM as sent", async () => {
    const { c, id, taskId } = await arrived();
    await gateMovementService.stamp(id, c, user, "gateIn");
    await reweighService.record(id, c, user, { weighedKg: 1234.5 });
    const row = await warehouseService.markSent(taskId, "vgm", "sent to the carrier", c, user);
    const data = row.data as Record<string, unknown>;
    expect(JSON.parse(data.vgm_sent as string)).toMatchObject({ note: "sent to the carrier", weighedKg: "1234.5" });
    expect((data.vgm_sent_history as Record<string, string>[]).at(-1)).toMatchObject({ weighedKg: "1234.5" });
    expect((await gateMovementService.get(id, c)).events.at(-1)!.label).toBe("Shipment Details: VGM sent (re-weighed 1 234.5 kg)");
  });
});
