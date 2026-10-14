import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shipments } from "~encore/clients";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { gateExceptionService } from "../services/gateException.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { warehouseService } from "../services/warehouse.service";
import { warehouseRecordsService } from "../services/warehouseRecords.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { EXCEPTION_GATE } from "../services/osd";
import { remeasureTotals } from "../services/remeasure";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: { usersList: vi.fn(async () => ({ users: [] })) },
  };
});

const user = randomUUID();
const shipmentUpdate = vi.mocked(shipments.shipmentUpdate);
beforeEach(() => shipmentUpdate.mockClear());

// A stand-alone export position (cargo arriving, příjem) whose release gates are all OK.
async function armedPosition() {
  const c = randomUUID();
  const { task, movement } = await warehouseImportService.createPosition(c, user, {
    handling: "Export",
    customsStatus: "Customs Cleared/Released",
    colli: 10,
    weightKg: 1000,
    measureCbm: 4,
  });
  await gateMovementRepository.update(movement.id, c, { releaseGates: movement.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
  const m = await gateMovementService.stamp(movement.id, c, user, "gateIn");
  expect(m.armed).toBe(true);
  return { c, id: movement.id, taskId: task.id };
}

const line = (m: { releaseGates: { g: string; s: string; note: string }[] }) => m.releaseGates.find((g) => g.g === EXCEPTION_GATE);

describe("damage / short / over exceptions", () => {
  it("lets a supervisor override release the cargo despite an open exception", async () => {
    const { c, id } = await armedPosition();
    await gateExceptionService.create(id, c, user, { type: "Short", pieces: 1, note: "one carton missing", source: "manual" });
    await expect(gateMovementService.stamp(id, c, user, "impRelease")).rejects.toThrow(/On hold/);
    const overridden = await gateMovementService.override(id, c, user, "customer collects short, agreed");
    expect(overridden).toMatchObject({ armed: true, openExceptions: 1 });
    expect((await gateMovementService.stamp(id, c, user, "impRelease")).impRelease).not.toBeNull();
  });

  it("puts the cargo on hold until every exception is resolved", async () => {
    const { c, id } = await armedPosition();
    let m = await gateExceptionService.create(id, c, user, { type: "Damaged", pieces: 3, note: "forks through the carton", source: "survey" });
    expect(line(m)).toMatchObject({ s: "Blocked", note: "1 open: Damaged 3 pcs" });
    expect(m).toMatchObject({ armed: false, openExceptions: 1 });
    expect(m.exceptions[0]).toMatchObject({ type: "Damaged", pieces: 3, status: "open", source: "survey" });
    expect(m.events.at(-1)).toMatchObject({ kind: "exceptionOpened", label: "Exception: Damaged 3 pcs — cargo on hold" });

    await expect(gateMovementService.stamp(id, c, user, "impRelease")).rejects.toThrow(/On hold/);
    // Even with the line ticked behind the service's back, the open exception still refuses it.
    await gateMovementRepository.update(id, c, { releaseGates: (await gateMovementRepository.findById(id, c))!.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
    await expect(gateMovementService.stamp(id, c, user, "impRelease")).rejects.toThrow(/could not be stamped|NOT armed|On hold/);

    // Nobody ticks the line by hand.
    await expect(gateMovementService.setReleaseGate(id, c, user, EXCEPTION_GATE, true)).rejects.toThrow(/resolve the exception/);

    await expect(gateExceptionService.resolve(id, m.exceptions[0]!.id, c, user, " ")).rejects.toThrow(/note is required/);
    m = await gateExceptionService.resolve(id, m.exceptions[0]!.id, c, user, "repacked, customer agreed");
    expect(line(m)).toMatchObject({ s: "OK", note: expect.stringMatching(/^resolved /) });
    expect(m).toMatchObject({ openExceptions: 0 });
    expect(m.exceptions[0]).toMatchObject({ status: "resolved", resolutionNote: "repacked, customer agreed" });
    await expect(gateExceptionService.resolve(id, m.exceptions[0]!.id, c, user, "again")).rejects.toThrow(/already resolved/);
    expect((await gateMovementService.stamp(id, c, user, "impRelease")).impRelease).not.toBeNull();
  });

  it("checks the input and the photos belong to this record", async () => {
    const { c, id } = await armedPosition();
    await expect(gateExceptionService.create(id, c, user, { type: "Lost", pieces: 1 })).rejects.toThrow(/Type must be/);
    await expect(gateExceptionService.create(id, c, user, { type: "Short", pieces: 0 })).rejects.toThrow(/at least 1/);
    await expect(gateExceptionService.create(id, c, user, { type: "Short", pieces: 1, fileIds: [randomUUID()] })).rejects.toThrow(/photo does not belong/);
    await expect(gateExceptionService.create(id, c, user, { type: "Short", pieces: 1, fileIds: ["../x"] })).rejects.toThrow(/photo does not belong/);
    await expect(gateExceptionService.create(randomUUID(), c, user, { type: "Short", pieces: 1 })).rejects.toThrow(/not found/);
  });

  it("keeps the line right when exceptions are opened and resolved at the same time", async () => {
    const { c, id } = await armedPosition();
    await Promise.all([
      gateExceptionService.create(id, c, user, { type: "Short", pieces: 1 }),
      gateExceptionService.create(id, c, user, { type: "Over", pieces: 2 }),
    ]);
    let m = await gateMovementService.get(id, c);
    expect(line(m)!.note).toMatch(/^2 open: /);
    await Promise.all(m.exceptions.map((e) => gateExceptionService.resolve(id, e.id, c, user, "counted again")));
    m = await gateMovementService.get(id, c);
    expect(line(m)!.s).toBe("OK");
    expect(m.armed).toBe(true);
  });

  it("records an exception after the release without touching the released gates", async () => {
    const { c, id } = await armedPosition();
    const released = await gateMovementService.stamp(id, c, user, "impRelease");
    const m = await gateExceptionService.create(id, c, user, { type: "Damaged", pieces: 1 });
    expect(line(m)).toBeUndefined();
    expect(m.releaseGates).toEqual(released.releaseGates);
    expect(m.openExceptions).toBe(1);
  });
});

describe("use remeasured figures for the warehouse", () => {
  it("sums the lines strictly", () => {
    expect(remeasureTotals(JSON.stringify([{ pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "250,5" }, { pieces: "1" }]))).toEqual({
      lines: 2,
      pieces: 3,
      weightKg: 501,
      cbm: 1.92,
    });
    expect(() => remeasureTotals(JSON.stringify([{ pieces: "1.5" }]))).toThrow(/whole number/);
    expect(() => remeasureTotals(JSON.stringify([{ pieces: "2", lengthCm: "abc" }]))).toThrow(/Line 1: length/);
    expect(() => remeasureTotals("{")).toThrow(/cannot be read/);
  });

  it("sets the gate figures only — never the shipment — on the lines as the client saw them", async () => {
    const { c, id, taskId } = await armedPosition();
    const rows = JSON.stringify([{ pieces: "12", lengthCm: "100", widthCm: "50", heightCm: "50", weightPerPcKg: "90" }]);
    const section = await warehouseService.patchSectionByTask(taskId, "job", c, [{ key: "remeasure_rows", value: rows, expected: "" }], user);
    await expect(gateMovementService.useRemeasured(id, c, user, section.version - 1)).rejects.toThrow(/changed meanwhile/);
    const m = await gateMovementService.useRemeasured(id, c, user, section.version);
    expect(m).toMatchObject({ colli: 12, weightKg: 1080, measureCbm: 3 });
    expect(m.events.at(-1)).toMatchObject({ kind: "gateFiguresFromRemeasurement", detail: "pieces 10→12 · kg 1000→1080 · cbm 4→3" });
    expect(shipmentUpdate).not.toHaveBeenCalled();
    await gateMovementService.stamp(id, c, user, "impRelease");
    await expect(gateMovementService.useRemeasured(id, c, user, section.version)).rejects.toThrow(/already released/);
  });

  it("needs saved lines", async () => {
    const { c, id } = await armedPosition();
    await expect(gateMovementService.useRemeasured(id, c, user, 0)).rejects.toThrow(/No remeasured lines/);
  });
});

describe("history and monitoring", () => {
  it("logs a wrong pick-up PIN with the tries left, never the PIN", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
    await gateMovementService.generatePickupPin(shipmentId, c, user);
    expect((await gateMovementService.verifyPin(r!.movementId!, c, user, "000000x")).result).toBe("no_match");
    const m = await gateMovementService.get(r!.movementId!, c);
    const ev = m.events.filter((e) => e.kind === "pinCheckFailed");
    expect(ev).toEqual([expect.objectContaining({ label: "PIN check: no match — 2 tries left" })]);
    expect(JSON.stringify(ev)).not.toContain("000000x");
  });

  it("logs a wrong gate PIN too", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "PIN-1", pin: "1234" });
    expect((await gateMovementService.verifyPin(m.id, c, user, "9999")).result).toBe("no_match");
    expect((await gateMovementService.get(m.id, c)).events.at(-1)).toMatchObject({ kind: "pinCheckFailed", label: "PIN check: no match — 2 tries left" });
  });

  it("reports pending and failed shipment updates and the storage of cargo in the warehouse", async () => {
    const c = randomUUID();
    const id = randomUUID();
    const row = (shipment: string) => ({
      companyId: c,
      movementId: id,
      shipmentId: shipment,
      kind: "received" as const,
      stamp: "gateIn",
      payload: {},
      actingUserId: user,
      actingRole: "user",
      nextAttemptAt: new Date(Date.now() + 3_600_000),
    });
    await db.transaction(async (tx) => {
      const [, b] = await shipmentOutboxRepository.enqueue(tx, [row(randomUUID()), row(randomUUID())]);
      return b;
    }).then((b) => shipmentOutboxRepository.markFailed(b!.id, 0, "test"));
    const summary = await warehouseRecordsService.reportSummary(c);
    expect(summary.shipmentUpdates).toMatchObject({ pending: 1, failed: 1, oldestPendingAt: expect.any(String) });
    expect(summary.storage).toEqual({ inWarehouse: 0, expiring: 0, chargeable: 0, estimatedCzk: 0 });
  });

  it("counts cargo in the warehouse by its storage clock", async () => {
    const { c } = await armedPosition();
    expect((await warehouseRecordsService.reportSummary(c)).storage).toMatchObject({ inWarehouse: 1, chargeable: 0, estimatedCzk: 0 });
    expect((await warehouseRecordsService.reportSummary(c)).shipmentUpdates).toEqual({ pending: 0, failed: 0, oldestPendingAt: null });
  });
});
