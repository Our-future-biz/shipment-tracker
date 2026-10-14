import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gateMovementService } from "../services/gateMovement.service";
import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";

// The real shipments service needs an authenticated caller, so the clients are replaced here
// and the test only checks what the gate sends back to the shipment.
const { shipmentUpdate } = vi.hoisted(() => ({ shipmentUpdate: vi.fn(async (_req: Record<string, unknown>) => ({})) }));
vi.mock("~encore/clients", () => ({
  shipments: {
    shipmentUpdate,
    shipmentGet: vi.fn(async () => {
      throw new Error("no shipment in tests");
    }),
  },
  auth: { usersList: vi.fn(async () => ({ users: [] })) },
}));

const user = randomUUID();

async function linkedRow() {
  const c = randomUUID();
  const shipmentId = randomUUID();
  const { task } = await warehouseTaskRepository.createForShipment(c, shipmentId, "WCZ20260916");
  const row = (await gateMovementService.list(c)).find((m) => m.warehouseTaskId === task.id)!;
  return { c, shipmentId, task, row };
}

// An incoming (příjem) linked row: only inbound arrival writes the received date back.
async function inboundRow() {
  const r = await linkedRow();
  await gateMovementRepository.update(r.row.id, r.c, { visit: "příjem", handling: "Export" });
  return r;
}

// Linked tasks come in as outgoing (výdej); this ticks every release gate so it is armed.
async function armedRow(plate = "3AB 1234") {
  const r = await linkedRow();
  await gateMovementRepository.update(r.row.id, r.c, { plate, releaseGates: r.row.releaseGates.map((g) => ({ ...g, s: "OK" as const })) });
  return r;
}

describe("gate stamps write back to the shipment", () => {
  beforeEach(() => shipmentUpdate.mockClear());

  it("sets the received date and the WCZ reference on gate-in, once", async () => {
    const { c, shipmentId, task, row } = await inboundRow();
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(shipmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId, warehouseReference: task.taskId, warehouseReceivedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
    await expect(gateMovementService.stamp(row.id, c, user, "gateIn")).rejects.toThrow(/already/);
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
  });

  it("treats the first export arrival stamp as the gate-in", async () => {
    const { c, shipmentId, task, row } = await inboundRow();
    await gateMovementService.stamp(row.id, c, user, "expDraft");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ shipmentId, warehouseReference: task.taskId }));
    await gateMovementService.stamp(row.id, c, user, "expReceipt");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
  });

  it("writes back once when ten clerks stamp gate-in together", async () => {
    const { c, row } = await inboundRow();
    await Promise.allSettled(Array.from({ length: 10 }, () => gateMovementService.stamp(row.id, c, user, "gateIn")));
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
  });

  it("sets the released date and the plate on WH release, once", async () => {
    const { c, shipmentId, row } = await armedRow();
    await gateMovementService.stamp(row.id, c, user, "impRelease");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(shipmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId, plateNumber: "3AB 1234", warehouseReleasedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
    // The release stamped the gate-out too, so there is nothing more to stamp or write back.
    await expect(gateMovementService.stamp(row.id, c, user, "gateOut")).rejects.toThrow(/already/);
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
  });

  it("writes back once when five clerks release together", async () => {
    const { c, row } = await armedRow();
    await Promise.allSettled(Array.from({ length: 5 }, () => gateMovementService.stamp(row.id, c, user, "impRelease")));
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
  });

  it("writes nothing back when the pickup truck gates in for outgoing cargo", async () => {
    const { c, row } = await linkedRow();
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    expect(shipmentUpdate).not.toHaveBeenCalled();
  });

  it("does not release an outgoing shipment through gate-out", async () => {
    const { c, row } = await linkedRow();
    await expect(gateMovementService.stamp(row.id, c, user, "gateOut")).rejects.toThrow(/WH release first/);
    expect(shipmentUpdate).not.toHaveBeenCalled();
  });

  it("writes nothing back on the gate-out of incoming (export) cargo", async () => {
    const { c, row } = await linkedRow();
    await gateMovementRepository.update(row.id, c, { visit: "příjem" });
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    await gateMovementService.stamp(row.id, c, user, "gateOut");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
  });
});
