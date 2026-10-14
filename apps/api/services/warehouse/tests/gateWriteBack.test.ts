import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { deliverDue, MAX_ATTEMPTS } from "../services/shipmentOutbox.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";

// The real shipments service needs an authenticated caller, so the clients are replaced here
// and the test only checks what the gate sends back to the shipment (and as whom).
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

async function linkedRow() {
  const c = randomUUID();
  const shipmentId = randomUUID();
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  const row = await gateMovementService.get(r!.movementId!, c);
  return { c, shipmentId, task: { id: r!.taskId!, taskId: r!.ref }, row };
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

const outboxOf = (movementId: string) => db.select().from(o).where(eq(o.movementId, movementId)).orderBy(o.createdAt);
// Makes every pending row of a record due now (as if its wait had passed).
const makeDue = (movementId: string) =>
  db.update(o).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(and(eq(o.movementId, movementId), eq(o.status, "pending")));
const asUser = (c: string, role = "user") => ({ authData: { userID: user, companyID: c, role } });

describe("gate stamps write back to the shipment", () => {
  beforeEach(() => {
    shipmentUpdate.mockReset();
    shipmentUpdate.mockImplementation(async () => ({}));
  });

  it("sets the received date and the WCZ reference on gate-in, once, as the stamping user", async () => {
    const { c, shipmentId, task, row } = await inboundRow();
    await gateMovementService.stamp(row.id, c, user, "gateIn", "manager");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(shipmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId, warehouseReference: task.taskId, warehouseReceivedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      asUser(c, "manager"),
    );
    await expect(gateMovementService.stamp(row.id, c, user, "gateIn")).rejects.toThrow(/already/);
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    const after = await gateMovementService.get(row.id, c);
    expect(after.shipmentUpdate).toBeNull();
    expect(after.events.at(-1)).toMatchObject({ kind: "shipmentUpdated", label: "Shipment updated: warehouse received date" });
  });

  it("treats the first export arrival stamp as the gate-in", async () => {
    const { c, shipmentId, task, row } = await inboundRow();
    await gateMovementService.stamp(row.id, c, user, "expDraft");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(shipmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ shipmentId, warehouseReference: task.taskId }), asUser(c));
    await gateMovementService.stamp(row.id, c, user, "expReceipt");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
  });

  it("writes back once when ten clerks stamp gate-in together", async () => {
    const { c, row } = await inboundRow();
    await Promise.allSettled(Array.from({ length: 10 }, () => gateMovementService.stamp(row.id, c, user, "gateIn")));
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(await outboxOf(row.id)).toHaveLength(1);
  });

  it("sets the released date and the plate on WH release, once", async () => {
    const { c, shipmentId, row } = await armedRow();
    await gateMovementService.stamp(row.id, c, user, "impRelease");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    expect(shipmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId, plateNumber: "3AB 1234", warehouseReleasedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      asUser(c),
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
    expect(await outboxOf(row.id)).toEqual([]);
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

  it("sends a plate entered after the release", async () => {
    const { c, shipmentId, row } = await armedRow("");
    await gateMovementService.stamp(row.id, c, user, "impRelease");
    expect(shipmentUpdate.mock.calls[0]![0]).not.toHaveProperty("plateNumber");
    await gateMovementService.update(row.id, c, user, { plate: "5XY 9988" }, "admin");
    expect(shipmentUpdate).toHaveBeenCalledTimes(2);
    expect(shipmentUpdate).toHaveBeenLastCalledWith({ shipmentId, plateNumber: "5XY 9988" }, asUser(c, "admin"));
    // Saving the same plate again sends nothing.
    await gateMovementService.update(row.id, c, user, { plate: "5XY 9988" });
    expect(shipmentUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("shipment update outbox", () => {
  beforeEach(() => {
    shipmentUpdate.mockReset();
    shipmentUpdate.mockImplementation(async () => ({}));
  });

  it("keeps the stamp and retries the update when Shipments is down", async () => {
    const { c, shipmentId, row } = await inboundRow();
    shipmentUpdate.mockRejectedValueOnce(new Error("shipments unavailable"));
    const stamped = await gateMovementService.stamp(row.id, c, user, "gateIn", "manager");
    expect(stamped.gateIn).not.toBeNull();
    expect(stamped.shipmentUpdate).toMatchObject({ state: "pending", what: ["warehouse received date"], attempts: 1, lastError: "shipments unavailable" });
    const [pending] = await outboxOf(row.id);
    expect(pending).toMatchObject({ status: "pending", stamp: "gateIn", attempts: 1, actingUserId: user, actingRole: "manager" });
    expect(pending!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet: nothing is sent.
    await deliverDue(row.id);
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    await makeDue(row.id);
    await deliverDue(row.id);
    expect(shipmentUpdate).toHaveBeenCalledTimes(2);
    expect(shipmentUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ shipmentId, warehouseReceivedDate: expect.any(String) }), asUser(c, "manager"));
    expect((await outboxOf(row.id))[0]).toMatchObject({ status: "sent", attempts: 2 });
    expect((await gateMovementService.get(row.id, c)).shipmentUpdate).toBeNull();
  });

  it("stops at an error a retry cannot fix and reports it", async () => {
    const { c, row } = await inboundRow();
    shipmentUpdate.mockRejectedValueOnce(APIError.notFound("Shipment not found"));
    const stamped = await gateMovementService.stamp(row.id, c, user, "gateIn");
    expect(stamped.shipmentUpdate).toMatchObject({ state: "failed", lastError: "Shipment not found", nextAttemptAt: null });
    expect(stamped.events.at(-1)).toMatchObject({ kind: "shipmentUpdateFailed", label: "Shipment not updated: warehouse received date" });
    // Retry now: back to pending and sent.
    const retried = await gateAdminService.retryShipmentUpdate(row.id, c, user);
    expect(retried.shipmentUpdate).toBeNull();
    expect(shipmentUpdate).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last attempt", async () => {
    const { c, row } = await inboundRow();
    shipmentUpdate.mockRejectedValue(new Error("timeout"));
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    await db.update(o).set({ attempts: MAX_ATTEMPTS - 1 }).where(eq(o.movementId, row.id));
    await makeDue(row.id);
    await deliverDue(row.id);
    expect((await outboxOf(row.id))[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    const dismissed = await gateAdminService.dismissShipmentUpdate(row.id, c, user);
    expect(dismissed.shipmentUpdate).toBeNull();
    expect(dismissed.events.at(-1)!.kind).toBe("shipmentUpdateDismissed");
  });

  it("sends a pending update once when two deliveries run together", async () => {
    const { c, row } = await inboundRow();
    shipmentUpdate.mockRejectedValueOnce(new Error("busy"));
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    await makeDue(row.id);
    shipmentUpdate.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return {};
    });
    await Promise.all([deliverDue(row.id), deliverDue(row.id), deliverDue(row.id)]);
    expect(shipmentUpdate).toHaveBeenCalledTimes(2);
  });

  it("keeps the order of one shipment's updates", async () => {
    const { c, row } = await inboundRow();
    shipmentUpdate.mockRejectedValue(new Error("down"));
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    await gateMovementRepository.update(row.id, c, { visit: "výdej", overridden: true });
    // The release is stamped while the received date is still waiting: it waits behind it.
    await gateMovementService.stamp(row.id, c, user, "impRelease");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    shipmentUpdate.mockReset();
    shipmentUpdate.mockImplementation(async () => ({}));
    await makeDue(row.id);
    await deliverDue(row.id);
    expect(shipmentUpdate.mock.calls.map((call) => Object.keys(call[0]).find((k) => /^warehouse(Received|Released)Date$/.test(k)))).toEqual([
      "warehouseReceivedDate",
      "warehouseReleasedDate",
    ]);
  });

  it("tells the manager when a stamp is voided while its update is on its way", async () => {
    const { c, row } = await inboundRow();
    shipmentUpdate.mockRejectedValueOnce(new Error("down"));
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    await makeDue(row.id);
    let notice = "";
    shipmentUpdate.mockImplementationOnce(async () => {
      notice = (await gateAdminService.voidStamp(row.id, c, user, "manager", "gateIn", "wrong truck")).notice;
      return {};
    });
    await deliverDue(row.id);
    expect(notice).toMatch(/not changed back/);
    expect((await outboxOf(row.id))[0]).toMatchObject({ status: "sent" });
    const after = await gateMovementService.get(row.id, c);
    expect(after.gateIn).toBeNull();
    expect(after.events.filter((e) => e.kind === "shipmentMayNeedCorrecting")).toHaveLength(2);
    expect(after.events.some((e) => e.kind === "shipmentUpdated" || e.kind === "shipmentUpdateCancelled")).toBe(false);
  });

  it("lets only the latest claim settle a row", async () => {
    const { c, row } = await inboundRow();
    shipmentUpdate.mockRejectedValueOnce(new Error("down"));
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    await makeDue(row.id);
    // The call outlives its lock and another run claims the row meanwhile.
    shipmentUpdate.mockImplementationOnce(async () => {
      await db.update(o).set({ attempts: 99, lockedUntil: new Date(Date.now() + 60_000) }).where(eq(o.movementId, row.id));
      return {};
    });
    await deliverDue(row.id);
    expect((await outboxOf(row.id))[0]).toMatchObject({ status: "pending", attempts: 99 });
    expect((await gateMovementService.get(row.id, c)).events.some((e) => e.kind === "shipmentUpdated")).toBe(false);
  });

  it("retry now also sends an older update of the same shipment that holds it back", async () => {
    const { c, shipmentId, row } = await inboundRow();
    // An older update of the shipment (another record) waits for a long retry.
    await db.insert(o).values({
      companyId: c,
      movementId: randomUUID(),
      shipmentId,
      kind: "plate",
      stamp: "",
      payload: { plate: "1AB 2345" },
      actingUserId: user,
      actingRole: "user",
      attempts: 6,
      nextAttemptAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date(Date.now() - 60_000),
    });
    await gateMovementService.stamp(row.id, c, user, "gateIn");
    expect(shipmentUpdate).not.toHaveBeenCalled();
    const retried = await gateAdminService.retryShipmentUpdate(row.id, c, user);
    expect(retried.shipmentUpdate).toBeNull();
    expect(shipmentUpdate.mock.calls.map((call) => ("plate" in call[0] ? "plate" : "received"))).toEqual(["plate", "received"]);
  });

  it("commits the update with the stamp — a stamp that fails leaves nothing owed", async () => {
    const { c, row } = await inboundRow();
    const spy = vi.spyOn(gateMovementRepository, "conditionalUpdate").mockResolvedValueOnce(null);
    await expect(gateMovementService.stamp(row.id, c, user, "gateIn")).rejects.toThrow();
    spy.mockRestore();
    expect(await outboxOf(row.id)).toEqual([]);
    expect((await gateMovementService.get(row.id, c)).gateIn).toBeNull();
  });
});
