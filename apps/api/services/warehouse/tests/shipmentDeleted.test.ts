import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { SHIPMENT_DELETED_EVENT, SHIPMENT_DELETED_REASON } from "../services/gateAdmin.service";
import { warehouseService } from "../services/warehouse.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";
import { warehouseSectionTable } from "../schemas/warehouseSection.schema";

// A shipment deleted in Shipments (the shipmentDeleted subscription → warehouseService.retireShipment):
// handled cargo stays in the warehouse, a never-stamped position goes through the normal remove.
const { shipmentUpdate } = vi.hoisted(() => ({ shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})) }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: { usersList: vi.fn(async () => ({ users: [] })) },
  };
});

const user = randomUUID();
const o = shipmentOutboxTable;
const s = warehouseSectionTable;

beforeEach(() => {
  shipmentUpdate.mockReset();
  shipmentUpdate.mockImplementation(async () => ({}));
});

async function linkedRow() {
  const c = randomUUID();
  const shipmentId = randomUUID();
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  return { c, shipmentId, taskId: r!.taskId!, movementId: r!.movementId!, ref: r!.ref };
}

const liveSections = (c: string, shipmentId: string) =>
  db.select().from(s).where(and(eq(s.companyId, c), eq(s.shipmentId, shipmentId), isNull(s.deletedAt)));

describe("a shipment deleted in Shipments", () => {
  it("removes a never-stamped position through the normal remove, its gate record archived with the reason", async () => {
    const { c, shipmentId, taskId, movementId } = await linkedRow();
    await warehouseService.patchSection(shipmentId, "job", c, [{ key: "notes", value: "fragile", expected: "" }]);
    await warehouseService.upsertPickupRows(shipmentId, c, { rows: "[]" });

    await warehouseService.retireShipment(shipmentId, c);

    expect((await warehouseTaskRepository.findAny(taskId, c))!.deletedAt).not.toBeNull();
    const archived = await gateMovementService.get(movementId, c);
    expect(archived).toMatchObject({ archiveReason: SHIPMENT_DELETED_REASON, archivedBy: "System" });
    expect(archived.archivedAt).not.toBeNull();
    // The position's own section stays with it (archived position); the pick-up row is retired.
    const left = await liveSections(c, shipmentId);
    expect(left.map((r) => [r.section, r.taskId])).toEqual([["job", taskId]]);
  });

  it("keeps a stamped position with a 'Shipment deleted' event and cancels what the gate still owes the shipment", async () => {
    const { c, shipmentId, taskId, movementId } = await linkedRow();
    await gateMovementRepository.update(movementId, c, { visit: "příjem", handling: "Export" });
    shipmentUpdate.mockRejectedValueOnce(new Error("shipments unavailable"));
    await gateMovementService.stamp(movementId, c, user, "gateIn", "manager");
    expect((await db.select().from(o).where(eq(o.movementId, movementId)))[0]).toMatchObject({ status: "pending" });
    await warehouseService.upsertPickupRows(shipmentId, c, { rows: "[]" });

    await warehouseService.retireShipment(shipmentId, c);
    // At-least-once delivery: a second run changes nothing.
    await warehouseService.retireShipment(shipmentId, c);

    expect((await warehouseTaskRepository.findAny(taskId, c))!.deletedAt).toBeNull();
    const kept = await gateMovementService.get(movementId, c);
    expect(kept.archivedAt).toBeNull();
    expect(kept.gateIn).not.toBeNull();
    expect(kept.events.filter((e) => e.kind === SHIPMENT_DELETED_EVENT)).toHaveLength(1);
    expect((await db.select().from(o).where(eq(o.movementId, movementId)))[0]).toMatchObject({ status: "cancelled", lastError: "shipment deleted in Shipments" });
    // The kept cargo keeps its pick-up row (the release at the gate still needs it).
    expect((await liveSections(c, shipmentId)).map((r) => r.section)).toEqual(["pickup"]);
  });

  it("does nothing for a shipment the warehouse never had, nor for an id that is not a uuid", async () => {
    const c = randomUUID();
    await expect(warehouseService.retireShipment(randomUUID(), c)).resolves.toBeUndefined();
    await expect(warehouseService.retireShipment("not-a-uuid", c)).resolves.toBeUndefined();
  });
});
