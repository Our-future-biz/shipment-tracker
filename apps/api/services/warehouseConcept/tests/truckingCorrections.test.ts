import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { truckingExpectService as svc, type ExpectArrivalInput } from "../services/truckingExpect.service";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { warehouseService } from "../services/warehouse.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { containerService } from "../services/container.service";
import { warehouseRecordsService as records } from "../services/warehouseRecords.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseStockLineTable, warehouseStockMovementTable } from "../schemas/warehouseStock.schema";
import { EXCEPTION_GATE } from "../services/osd";
import { MAX_PICKUP_ROWS } from "../services/pickupPin";
import { shipmentData } from "./shipmentFakes";

// Trucking Council corrections in the warehouse (16 Oct 2026): Domestic at the hub (C1 / C10), a
// Direction change before any stamp (C11), what a void / archive / removal tells Trucking (C12,
// decision 4), arrival by the trip's kind (decision 3), and a trip's cancel (containers, figures).

const { publish, shipmentUpdate } = vi.hoisted(() => ({
  publish: vi.fn(async (_e: unknown) => "msg"),
  shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})),
}));
vi.mock("../topics", () => ({ warehouseGateStamped: { publish } }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
const TRIP_ID = "6f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const AT = "2026-10-15T08:00:00.000Z";

const arrival = (shipmentId: string, extra: Partial<ExpectArrivalInput> = {}): ExpectArrivalInput => ({
  shipmentId,
  tripRef: "LCZ26-0100",
  tripKind: "PICKUP_RUN",
  haulierName: "Rapid",
  plate: "1AB 2345",
  driver: "Jan",
  driverPhone: "",
  expectedAt: AT,
  pieces: 4,
  weightKg: 400,
  cbm: 2,
  ...extra,
});

const kinds = () => publish.mock.calls.map((c) => {
  const e = c[0] as { kind: string; stampKind: string };
  return `${e.kind}/${e.stampKind}`;
});
const linesOf = (c: string, movementId: string) =>
  db.select().from(warehouseStockLineTable).where(and(eq(warehouseStockLineTable.companyId, c), eq(warehouseStockLineTable.movementId, movementId)));
const movesOf = (c: string, movementId: string) =>
  db.select().from(warehouseStockMovementTable).where(and(eq(warehouseStockMovementTable.companyId, c), eq(warehouseStockMovementTable.movementId, movementId)));
const allGatesOk = async (id: string, c: string) => {
  const m = await gateMovementService.get(id, c);
  await gateMovementRepository.update(id, c, { releaseGates: m.releaseGates.map((g) => ({ g: g.g, s: "OK" as const, note: g.note })) });
};

async function trip(tradeDirection: string, extra: Partial<ExpectArrivalInput> = {}) {
  const c = randomUUID();
  const shipmentId = randomUUID();
  shipmentData.set(shipmentId, { tradeDirection, customsStatus: "Paperwork Verified" });
  const r = await svc.expectArrival(c, user, arrival(shipmentId, extra));
  return { c, shipmentId, ...r };
}

beforeEach(() => {
  publish.mockReset();
  publish.mockImplementation(async () => "msg");
  shipmentUpdate.mockReset();
  shipmentUpdate.mockImplementation(async () => ({}));
});

describe("Domestic: the gate-in is the receipt (C1, C10)", () => {
  it("opens Stock on Hand at the gate-in, with the storage clock; no draft receipt, receipt or re-weigh", async () => {
    const { c, shipmentId, gateMovementId: id } = await trip("Domestic");
    const before = await gateMovementService.get(id, c);
    expect(before.needsReweigh).toBe(false);
    expect(await linesOf(c, id)).toEqual([]);

    const m = await gateMovementService.stamp(id, c, user, "gateIn");
    // Received at the gate-in; its release gates are clear, so it is ready to go.
    expect(m.lifecycle.stage).toBe("ready");
    expect(m.lifecycle.steps.map((s) => s.stage)).toEqual(["expected", "arrived", "received", "in_warehouse", "ready", "left"]);
    expect(m.storage.started).toBe(true);
    const [line] = await linesOf(c, id);
    expect(line).toMatchObject({ status: "Available", pieces: 4, receivedAt: m.storage.startDate });
    expect((await movesOf(c, id)).map((r) => [r.type, r.reference])).toEqual([["Receipt", "Gate-in (Domestic: the gate-in is the receipt)"]]);

    await expect(gateMovementService.stamp(id, c, user, "expDraft")).rejects.toThrow(/Domestic cargo has no draft receipt or receipt/);
    await expect(gateMovementService.stamp(id, c, user, "expReceipt")).rejects.toThrow(/Domestic cargo has no draft receipt or receipt/);

    // The line haul is planned: the cargo leaves on the OUT leg, so its plate goes to the shipment.
    await svc.expectDeparture(c, user, { ...arrival(shipmentId), tripRef: "LCZ26-0200", tripKind: "LINEHAUL", plate: "9LH 0001" });
    const released = await gateMovementService.stamp(id, c, user, "impRelease");
    expect(released.lifecycle.stage).toBe("left");
    expect((await linesOf(c, id))[0]).toMatchObject({ status: "Picked" });
    expect((await movesOf(c, id)).at(-1)).toMatchObject({ type: "Pick", toLocation: "truck 9LH 0001" });
    expect(shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ shipmentId, warehouseReleasedDate: expect.any(String), plateNumber: "9LH 0001" }), expect.anything());
    // Once gated in, the grid shows the truck it leaves on.
    expect(released.plate).toBe("9LH 0001");
  });
});

describe("Direction into or out of Domestic (C11)", () => {
  it("rebuilds the release gates for the new handling before any stamp, keeping the exception hold; refused after a stamp", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "DIR-1", handling: "Import", visit: "výdej" });
    expect(m.releaseGates.map((g) => g.g)).toEqual(["B/L / release order", "Customs", "Charges", "Storage settled"]);
    // An open exception's hold line is not the direction's to drop.
    await gateMovementRepository.update(m.id, c, { releaseGates: [...m.releaseGates, { g: EXCEPTION_GATE, s: "Blocked", note: "1 open" }] });

    const dom = await gateMovementService.update(m.id, c, user, { handling: "Domestic" });
    expect(dom).toMatchObject({ handling: "Domestic", visit: "příjem" });
    expect(dom.releaseGates.map((g) => g.g)).toEqual(["Charges", "Storage settled", EXCEPTION_GATE]);
    expect(dom.events.some((e) => e.kind === "releaseGatesRebuilt")).toBe(true);

    const back = await gateMovementService.update(m.id, c, user, { handling: "Import" });
    expect(back.visit).toBe("výdej");
    expect(back.releaseGates.map((g) => g.g)).toEqual(["B/L / release order", "Customs", "Charges", "Storage settled", EXCEPTION_GATE]);

    await gateMovementService.update(m.id, c, user, { handling: "Domestic" });
    await gateMovementService.stamp(m.id, c, user, "gateIn");
    await expect(gateMovementService.update(m.id, c, user, { handling: "Export" })).rejects.toThrow(/Direction cannot change once a gate stamp is recorded/);
  });
});

describe("What Trucking hears (C12, decisions 3 and 4)", () => {
  it("a voided WH release always takes back its gateOut — also after an export truck's earlier gate-out", async () => {
    const { c, gateMovementId: id } = await trip("Export");
    await gateMovementService.stamp(id, c, user, "gateIn");
    // The delivering truck leaves: the cargo stays, nothing is told.
    await gateMovementService.stamp(id, c, user, "gateOut");
    await allGatesOk(id, c);
    const released = await gateMovementService.stamp(id, c, user, "impRelease");
    expect(released.gateOut).not.toBe(released.impRelease);
    expect(kinds()).toEqual(["gateIn/gateIn", "gateOut/impRelease"]);
    const voided = await gateAdminService.voidStamp(id, c, user, "manager", "impRelease", "still here");
    // The truck's own gate-out stays; Trucking is told the cargo did not leave.
    expect(voided.movement.gateOut).not.toBeNull();
    expect(kinds()).toEqual(["gateIn/gateIn", "gateOut/impRelease", "voided/gateOut"]);
  });

  it("an outbound position brought in by a pick-up run arrives with its gate-in (arrival by trip, not by visit)", async () => {
    const { c, gateMovementId: id, positionId } = await trip("Import");
    expect((await gateMovementService.get(id, c)).visit).toBe("výdej");
    await gateMovementService.stamp(id, c, user, "gateIn");
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0]).toMatchObject({ kind: "gateIn", stampKind: "gateIn", positionId });
    // Its void takes the arrival back.
    await gateAdminService.voidStamp(id, c, user, "manager", "gateIn", "wrong truck");
    expect(kinds()).toEqual(["gateIn/gateIn", "voided/gateIn"]);

    // Without a pick-up run, an outbound gate-in is the truck that picks the cargo up: nothing.
    const [plain] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
    publish.mockClear();
    await gateMovementService.stamp(plain!.movementId!, c, user, "gateIn");
    expect(publish).not.toHaveBeenCalled();
  });

  it("archiving a stamped record takes back each step it published", async () => {
    const { c, gateMovementId: id } = await trip("Domestic");
    await gateMovementService.stamp(id, c, user, "gateIn");
    await gateMovementService.stamp(id, c, user, "impRelease");
    publish.mockClear();
    await gateAdminService.archive(id, c, user, "manager", "entered twice");
    expect(kinds().sort()).toEqual(["voided/gateIn", "voided/gateOut"]);
  });

  it("a manager removing a stamped position takes back its arrival", async () => {
    const { c, gateMovementId: id, positionId } = await trip("Export");
    await gateMovementService.stamp(id, c, user, "gateIn");
    publish.mockClear();
    await gateAdminService.removePosition(positionId, c, user, "manager", "booked by mistake");
    expect(kinds()).toEqual(["voided/gateIn"]);
  });
});

describe("a trip's cancel", () => {
  it("keeps a position the container plan holds (never takes a house out of a container) and does not fail", async () => {
    const { c, shipmentId, gateMovementId: id } = await trip("Import");
    const box = await records.createContainer(c, { number: "MSKU 7", direction: "Unloading" }, user);
    await containerService.addPositions(box.id, c, user, [id]);
    await expect(svc.cancelExpected(c, user, { shipmentId, tripRef: "LCZ26-0100" })).resolves.toEqual({ ok: true });
    expect(await warehouseTaskRepository.findLiveForShipment(c, shipmentId)).not.toBeNull();
    expect((await containerService.detail(box.id, c)).positions.map((p) => p.movementId)).toEqual([id]);
  });

  it("marks the figures it wrote and clears on cancel only those still untouched", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    await warehouseImportService.importShipments(c, user, [shipmentId]);
    const r = await svc.expectArrival(c, user, arrival(shipmentId, { tripId: TRIP_ID }));
    const m = await gateMovementService.get(r.gateMovementId, c);
    expect(m.tripFigures).toEqual({ source: { kind: "trucking", tripRef: "LCZ26-0100", tripKind: "PICKUP_RUN", tripId: TRIP_ID }, colli: 4, weightKg: 400, measureCbm: 2 });
    // The warehouse counts the pieces itself.
    await gateMovementService.update(r.gateMovementId, c, user, { colli: 5 });
    await svc.cancelExpected(c, user, { shipmentId, tripRef: "LCZ26-0100" });
    const after = await gateMovementService.get(r.gateMovementId, c);
    expect(after).toMatchObject({ colli: 5, weightKg: 0, measureCbm: 0, tripFigures: null });
    expect(after.events.at(-1)).toMatchObject({ kind: "tripCancelled", detail: expect.stringMatching(/gate figures \(kg, cbm\)/) });
  });

  it("keeps the figures once the gate stamped", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    await warehouseImportService.importShipments(c, user, [shipmentId]);
    const r = await svc.expectArrival(c, user, arrival(shipmentId));
    await gateMovementService.stamp(r.gateMovementId, c, user, "gateIn");
    await svc.cancelExpected(c, user, { shipmentId, tripRef: "LCZ26-0100" });
    expect(await gateMovementService.get(r.gateMovementId, c)).toMatchObject({ colli: 4, weightKg: 400, measureCbm: 2 });
  });
});

describe("pick-up rows", () => {
  it("counts the trip's rows in the limit", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    await svc.expectDeparture(c, user, { ...arrival(shipmentId), tripKind: "DELIVERY_RUN" });
    const rows = (n: number) => ({ rows: JSON.stringify(Array.from({ length: n }, (_, i) => ({ haulier: `H${i}`, licensePlate: "", driver: "" }))) });
    await expect(warehouseService.upsertPickupRows(shipmentId, c, rows(MAX_PICKUP_ROWS))).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(warehouseService.upsertPickupRows(shipmentId, c, rows(MAX_PICKUP_ROWS - 1))).resolves.toBeTruthy();
  });
});
