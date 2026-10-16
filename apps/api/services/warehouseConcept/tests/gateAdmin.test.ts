import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { gateMovementService } from "../services/gateMovement.service";
import { reweighService } from "../services/reweigh.service";
import { gateAdminService, statusAfterVoid, voidBlocked } from "../services/gateAdmin.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { containerService } from "../services/container.service";
import { gateFileService } from "../services/gateFile.service";
import { shipmentOutboxTable } from "../schemas/shipmentOutbox.schema";

const { shipmentUpdate } = vi.hoisted(() => ({ shipmentUpdate: vi.fn(async (_req: Record<string, unknown>, _opts?: unknown) => ({})) }));
vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate, shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
beforeEach(() => {
  shipmentUpdate.mockReset();
  shipmentUpdate.mockImplementation(async () => ({}));
});

async function linked(inbound = false) {
  const c = randomUUID();
  const [r] = await warehouseImportService.importShipments(c, user, [randomUUID()]);
  if (inbound) await gateMovementRepository.update(r!.movementId!, c, { visit: "příjem", handling: "Export" });
  return { c, id: r!.movementId!, taskId: r!.taskId!, ref: r!.ref };
}

describe("deleting and archiving", () => {
  it("lets any user delete an unstamped record but not a stamped one", async () => {
    const c = randomUUID();
    const a = await gateMovementService.create(c, user, { gateRef: "A" });
    await gateMovementService.remove(a.id, c, user);
    expect((await gateMovementService.get(a.id, c)).archivedAt).not.toBeNull();

    const b = await gateMovementService.create(c, user, { gateRef: "B" });
    await gateMovementService.stamp(b.id, c, user, "gateIn");
    await expect(gateMovementService.remove(b.id, c, user)).rejects.toThrow(/manager can archive it/);
    expect((await gateMovementService.get(b.id, c)).archivedAt).toBeNull();
  });

  it("archives (manager, with reason) and restores a stamped record, logged", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "C" });
    await gateMovementService.stamp(m.id, c, user, "gateIn");
    await expect(gateAdminService.archive(m.id, c, user, "user", "duplicate")).rejects.toThrow(/Only a manager/);
    await expect(gateAdminService.archive(m.id, c, user, "manager", " ")).rejects.toThrow(/reason is required/);
    const archived = await gateAdminService.archive(m.id, c, user, "manager", "duplicate of C2");
    expect(archived).toMatchObject({ archiveReason: "duplicate of C2", gateIn: m.gateIn ?? expect.any(String) });
    expect(archived.archivedAt).not.toBeNull();
    expect((await gateMovementService.list(c)).some((x) => x.id === m.id)).toBe(false);
    expect((await gateMovementService.list(c, { archived: true })).map((x) => x.id)).toEqual([m.id]);
    // No gate action on an archived record.
    await expect(gateMovementService.stamp(m.id, c, user, "gateOut")).rejects.toThrow(/not found/);

    await expect(gateAdminService.restore(m.id, c, user, "user", "x")).rejects.toThrow(/Only a manager/);
    const restored = await gateAdminService.restore(m.id, c, user, "admin", "was right after all");
    expect(restored).toMatchObject({ archivedAt: null, archiveReason: "" });
    expect(restored.events.slice(-2).map((e) => [e.kind, e.detail])).toEqual([
      ["archived", "duplicate of C2"],
      ["restored", "was right after all"],
    ]);
    await expect(gateAdminService.restore(m.id, c, user, "admin", "again")).rejects.toThrow(/not archived/);
  });

  it("restores a position removed with its record, unless the shipment came back meanwhile", async () => {
    const { c, id, taskId, ref } = await linked();
    await gateMovementService.stamp(id, c, user, "gateIn");
    await gateAdminService.removePosition(taskId, c, user, "manager", "wrong shipment");
    const back = await gateAdminService.restore(id, c, user, "manager", "it was right");
    expect(back).toMatchObject({ positionRef: ref, archivedAt: null });
    expect(back.events.at(-1)!.label).toBe(`Restored with its position ${ref}`);

    // Removed again, then the shipment is imported again: the old record cannot come back.
    await gateAdminService.removePosition(taskId, c, user, "manager", "again wrong");
    const shipmentId = back.shipmentId!;
    const [again] = await warehouseImportService.importShipments(c, user, [shipmentId]);
    expect(again!.outcome).toBe("created");
    await expect(gateAdminService.restore(id, c, user, "manager", "x")).rejects.toThrow(new RegExp(`in the warehouse again under ${again!.ref}`));
  });
});

describe("restoring a removed position", () => {
  it("brings back the position's other records archived with it, not one archived on its own before", async () => {
    const { c, id, taskId, ref } = await linked();
    await gateMovementService.stamp(id, c, user, "gateIn");
    const second = await gateMovementService.create(c, user, { gateRef: "S2", warehouseTaskId: taskId });
    const alone = await gateMovementService.create(c, user, { gateRef: "S3", warehouseTaskId: taskId });
    await gateAdminService.archive(alone.id, c, user, "manager", "duplicate");
    await gateAdminService.removePosition(taskId, c, user, "manager", "wrong shipment");
    expect((await gateMovementService.get(second.id, c)).archivedAt).not.toBeNull();

    await gateAdminService.restore(id, c, user, "manager", "it was right");
    const back = await gateMovementService.get(second.id, c);
    expect(back).toMatchObject({ archivedAt: null, archiveReason: "" });
    expect(back.events.at(-1)).toMatchObject({ kind: "restored", label: `Restored with its position ${ref}`, detail: "it was right" });
    expect((await gateMovementService.get(alone.id, c))).toMatchObject({ archiveReason: "duplicate" });
    expect((await gateMovementService.get(alone.id, c)).archivedAt).not.toBeNull();
  });
});

describe("voiding a stamp", () => {
  it("follows the order of the stamps", () => {
    const none = { gateIn: null, gateOut: null, impRelease: null, expDraft: null, expReceipt: null };
    const d = new Date();
    expect(voidBlocked(none, "gateIn")).toMatch(/not stamped/);
    expect(voidBlocked({ ...none, gateIn: d, expDraft: d }, "gateIn")).toMatch(/receipt/);
    expect(voidBlocked({ ...none, gateIn: d, impRelease: d }, "gateIn")).toMatch(/WH release first/);
    expect(voidBlocked({ ...none, gateIn: d, gateOut: d }, "gateIn")).toMatch(/gate-out first/);
    expect(voidBlocked({ ...none, expDraft: d, expReceipt: d }, "expDraft")).toMatch(/WH receipt first/);
    expect(voidBlocked({ ...none, expDraft: d, expReceipt: d }, "expReceipt")).toBeNull();
    // A gate-out stamped with the WH release goes only with it; an outgoing gate-out stamped
    // later is voided before the release.
    expect(voidBlocked({ ...none, impRelease: d, gateOut: d }, "gateOut")).toMatch(/void the WH release instead/);
    const later = new Date(d.getTime() + 60_000);
    expect(voidBlocked({ ...none, impRelease: d, gateOut: later, visit: "výdej" }, "impRelease")).toMatch(/gate-out first/);
    expect(voidBlocked({ ...none, impRelease: d, gateOut: later, visit: "výdej" }, "gateOut")).toBeNull();
    expect(voidBlocked({ ...none, impRelease: d, gateOut: d, visit: "výdej" }, "impRelease")).toBeNull();
    expect(statusAfterVoid("Released", { ...none, gateIn: d })).toBe("In Warehouse");
    expect(statusAfterVoid("In Warehouse", none)).toBe("Expected");
    expect(statusAfterVoid("Refused", none)).toBe("Refused");
  });

  it("voids the WH release with its gate-out and logs that the shipment may need correcting", async () => {
    const { c, id } = await linked();
    await gateMovementRepository.update(id, c, { overridden: true });
    await gateMovementService.stamp(id, c, user, "gateIn");
    await gateMovementService.stamp(id, c, user, "impRelease");
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);

    await expect(gateAdminService.voidStamp(id, c, user, "user", "impRelease", "wrong truck")).rejects.toThrow(/Only a manager/);
    await expect(gateAdminService.voidStamp(id, c, user, "manager", "gateIn", "wrong")).rejects.toThrow(/WH release first/);
    const res = await gateAdminService.voidStamp(id, c, user, "manager", "impRelease", "wrong truck");
    expect(res.movement).toMatchObject({ impRelease: null, gateOut: null, status: "In Warehouse" });
    expect(res.notice).toMatch(/not changed back/);
    expect(res.movement.events.slice(-3).map((e) => e.label)).toEqual(["WH release voided", "Gate-out voided", "Shipment may need correcting"]);
    expect(res.movement.events.at(-3)!.detail).toMatch(/^wrong truck · was /);
    // The shipment is not touched by the void.
    expect(shipmentUpdate).toHaveBeenCalledTimes(1);
    // The release can be stamped again.
    expect((await gateMovementService.stamp(id, c, user, "impRelease")).status).toBe("Released");
  });

  it("cancels a received date not yet sent", async () => {
    const { c, id } = await linked(true);
    shipmentUpdate.mockRejectedValueOnce(new Error("down"));
    await gateMovementService.stamp(id, c, user, "gateIn");
    const res = await gateAdminService.voidStamp(id, c, user, "manager", "gateIn", "truck never came");
    expect(res).toMatchObject({ notice: "", movement: { gateIn: null, status: "Expected", shipmentUpdate: null } });
    expect(res.movement.events.at(-1)!.kind).toBe("shipmentUpdateCancelled");
    const rows = await db.select().from(shipmentOutboxTable).where(eq(shipmentOutboxTable.movementId, id));
    expect(rows.map((r) => r.status)).toEqual(["cancelled"]);
  });

  it("lets one of a void and a stamp racing on the record win", async () => {
    const c = randomUUID();
    const m = await gateMovementService.create(c, user, { gateRef: "R", handling: "Export" });
    await gateMovementService.stamp(m.id, c, user, "expDraft");
    // LCL cargo is re-weighed before its receipt.
    await reweighService.record(m.id, c, user, { weighedKg: 500 });
    // The record is read before the receipt lands; the void must not go through on what it read.
    const load = gateMovementRepository.findById.bind(gateMovementRepository);
    const spy = vi.spyOn(gateMovementRepository, "findById").mockImplementationOnce(async (...args) => {
      const row = await load(...args);
      await gateMovementService.stamp(m.id, c, user, "expReceipt");
      return row;
    });
    await expect(gateAdminService.voidStamp(m.id, c, user, "manager", "expDraft", "wrong")).rejects.toThrow(/changed meanwhile/);
    spy.mockRestore();
    expect((await gateMovementService.get(m.id, c)).expDraft).not.toBeNull();
  });
});

describe("an id that is not a record's id", () => {
  it("is not found (404), never a database error", async () => {
    const c = randomUUID();
    const notFound = { code: "not_found" };
    await expect(gateAdminService.voidStamp("not-an-id", c, user, "manager", "gateIn", "wrong")).rejects.toMatchObject(notFound);
    await expect(gateAdminService.archive("not-an-id", c, user, "manager", "duplicate")).rejects.toMatchObject(notFound);
    await expect(gateAdminService.restore("not-an-id", c, user, "manager", "back")).rejects.toMatchObject(notFound);
    await expect(gateAdminService.removePosition("not-an-id", c, user, "manager", "wrong")).rejects.toMatchObject(notFound);
    await expect(gateMovementService.get("not-an-id", c)).rejects.toMatchObject(notFound);
    await expect(gateMovementService.stamp("not-an-id", c, user, "gateIn")).rejects.toMatchObject(notFound);
    await expect(containerService.voidStamp("not-an-id", c, user, "manager", "gateIn", "wrong")).rejects.toMatchObject(notFound);
    await expect(gateMovementService.update("not-an-id", c, user, { gateRef: "X" })).rejects.toMatchObject(notFound);
    await expect(gateMovementService.remove("not-an-id", c, user)).rejects.toMatchObject(notFound);
    await expect(gateMovementService.refuse("not-an-id", c, user, "no papers")).rejects.toMatchObject(notFound);
    await expect(gateMovementService.override("not-an-id", c, user, "ok")).rejects.toMatchObject(notFound);
    await expect(gateMovementService.verifyPin("not-an-id", c, user, "1234")).rejects.toMatchObject(notFound);
    await expect(gateAdminService.retryShipmentUpdate("not-an-id", c, user)).rejects.toMatchObject(notFound);
    await expect(gateFileService.list("not-an-id", c)).rejects.toMatchObject(notFound);
    await expect(reweighService.record("not-an-id", c, user, { weighedKg: 100 })).rejects.toMatchObject(notFound);
    const m = await gateMovementService.create(c, user, { gateRef: "D" });
    await expect(gateFileService.content(m.id, "not-an-id", c)).rejects.toMatchObject(notFound);
    await expect(gateFileService.remove(m.id, "not-an-id", c)).rejects.toMatchObject(notFound);
  });
});
