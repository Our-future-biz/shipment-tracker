import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseSectionTable } from "../schemas/warehouseSection.schema";
import { warehouseService } from "../services/warehouse.service";
import { gateMovementService } from "../services/gateMovement.service";
import { readPickup } from "../services/pickupPin";
import { failingShipments, notFound } from "./shipmentFakes";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: (await import("./authFake")).authFake([]),
  };
});

const user = randomUUID();
const job = (c: string, s: string, changes: { key: string; value: string; expected: string }[]) => warehouseService.patchSection(s, "job", c, changes);

describe("Shipment Details saved field by field", () => {
  it("keeps both changes when two people save different fields at the same time, even on the first save", async () => {
    const c = randomUUID();
    const s = randomUUID();
    await Promise.all([
      job(c, s, [{ key: "notes", value: "fragile", expected: "" }]),
      job(c, s, [{ key: "remeasure_rows", value: JSON.stringify([{ qty: 2 }]), expected: "" }]),
    ]);
    const row = (await warehouseService.getSection(s, "job", c))!;
    // Saving the lines also records when they were saved (the "send the remeasurement" prompt).
    expect(row.data).toEqual({ notes: "fragile", remeasure_rows: '[{"qty":2}]', remeasure_rows_saved_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    expect(row.version).toBe(2);
  });

  it("refuses a save of a field someone else changed meanwhile, and leaves the others alone", async () => {
    const c = randomUUID();
    const s = randomUUID();
    await job(c, s, [{ key: "notes", value: "A", expected: "" }]);
    await job(c, s, [{ key: "notes", value: "B", expected: "A" }]);
    await expect(job(c, s, [{ key: "notes", value: "C", expected: "A" }])).rejects.toThrow(/Changed meanwhile: notes/);
    // A second "mark as sent" from a stale page is refused too.
    const sent = JSON.stringify({ timestamp: "2026-10-14T10:00:00Z", note: "" });
    await job(c, s, [{ key: "vgm_sent", value: sent, expected: "" }]);
    await expect(job(c, s, [{ key: "vgm_sent", value: sent, expected: "" }])).rejects.toThrow(/VGM sent/);
    // A refused save writes nothing, not even its other fields.
    await expect(
      job(c, s, [
        { key: "inform_operations_sent", value: "2026-10-14T11:00:00Z", expected: "" },
        { key: "notes", value: "D", expected: "A" },
      ]),
    ).rejects.toThrow(/notes/);
    expect((await warehouseService.getSection(s, "job", c))!.data).toEqual({ notes: "B", vgm_sent: sent });
  });

  it("starts a deleted section afresh", async () => {
    const c = randomUUID();
    const s = randomUUID();
    await job(c, s, [{ key: "notes", value: "old", expected: "" }]);
    await db.update(warehouseSectionTable).set({ deletedAt: new Date() }).where(and(eq(warehouseSectionTable.companyId, c), eq(warehouseSectionTable.shipmentId, s)));
    expect(await warehouseService.getSection(s, "job", c)).toBeNull();
    expect(await job(c, s, [{ key: "notes", value: "new", expected: "" }])).toMatchObject({ data: { notes: "new" }, deletedAt: null });
  });

  it("clears a field with an empty value", async () => {
    const c = randomUUID();
    const s = randomUUID();
    await job(c, s, [{ key: "notes", value: "x", expected: "" }]);
    const row = await job(c, s, [{ key: "notes", value: "", expected: "x" }]);
    expect(row.data).toEqual({ notes: "" });
    expect(await job(c, s, [{ key: "notes", value: "y", expected: "" }])).toMatchObject({ data: { notes: "y" } });
  });

  it("accepts only the Shipment Details fields, in their limits", async () => {
    const c = randomUUID();
    const s = randomUUID();
    await expect(job(c, s, [{ key: "pin", value: "123456", expected: "" }])).rejects.toThrow(/Unknown field/);
    await expect(job(c, s, [{ key: "notes", value: "x".repeat(10_001), expected: "" }])).rejects.toThrow(/too long/);
    await expect(job(c, s, [{ key: "remeasure_rows", value: "[1]", expected: "" }])).rejects.toThrow(/list of up to/);
    await expect(job(c, s, [{ key: "remeasure_rows", value: "{", expected: "" }])).rejects.toThrow(/JSON list/);
    await expect(job(c, s, [])).rejects.toThrow(/1 to 10/);
    await expect(
      job(c, s, [
        { key: "notes", value: "a", expected: "" },
        { key: "notes", value: "b", expected: "" },
      ]),
    ).rejects.toThrow(/once/);
    await expect(warehouseService.patchSection(s, "pickup", c, [{ key: "pin", value: "1", expected: "" }])).rejects.toThrow(/not saved field by field/);
  });

  it("refuses the first save for a shipment the caller cannot see", async () => {
    const c = randomUUID();
    const s = randomUUID();
    failingShipments.set(s, notFound());
    await expect(job(c, s, [{ key: "notes", value: "x", expected: "" }])).rejects.toThrow(/Shipment not found/);
    expect(await warehouseService.getSection(s, "job", c)).toBeNull();
  });

  it("never writes the pick-up PIN through a section save", async () => {
    const c = randomUUID();
    const s = randomUUID();
    await gateMovementService.generatePickupPin(s, c, user);
    const before = readPickup((await warehouseService.getSection(s, "pickup", c))!.data);
    await warehouseService.upsertPickupRows(s, c, { rows: "[]", pin: "999999", pinTries: 0 });
    const after = readPickup((await warehouseService.getSection(s, "pickup", c))!.data);
    expect(after.pin).toBe(before.pin);
    expect((await warehouseService.getSection(s, "pickup", c))!.version).toBe(1);
  });
});
