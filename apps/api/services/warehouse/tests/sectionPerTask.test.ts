import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseSectionTable } from "../schemas/warehouseSection.schema";
import { warehouseService } from "../services/warehouse.service";
import { warehouseImportService } from "../services/warehouseImport.service";
import { gateMovementService } from "../services/gateMovement.service";
import { gateAdminService } from "../services/gateAdmin.service";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";
import { readPickup } from "../services/pickupPin";

vi.mock("~encore/clients", async () => {
  const { getShipment } = await import("./shipmentFakes");
  return {
    shipments: { shipmentUpdate: vi.fn(async () => ({})), shipmentGet: vi.fn(getShipment) },
    auth: { usersList: vi.fn(async () => ({ users: [] })) },
  };
});

const user = randomUUID();

// The backfill UPDATE exactly as written in migration 0015 (so the test runs the migration's own
// SQL; warehouseSectionRepository.backfillTaskIds is a copy of it and is checked against it below).
function migrationBackfill(): string {
  const file = fileURLToPath(new URL("../db/migrations/0015_section_per_task_exceptions.sql", import.meta.url));
  const stmt = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
    .find((x) => x.startsWith(`UPDATE "warehouse_section"`));
  if (!stmt) throw new Error("migration 0015 has no warehouse_section backfill");
  return stmt;
}
type Change = { key: string; value: string; expected: string };
const byTask = (c: string, taskId: string, changes: Change[]) => warehouseService.patchSectionByTask(taskId, "job", c, changes, user);
const byShipment = (c: string, shipmentId: string, changes: Change[]) => warehouseService.patchSection(shipmentId, "job", c, changes, user);

async function linked(c = randomUUID(), shipmentId = randomUUID()) {
  const [r] = await warehouseImportService.importShipments(c, user, [shipmentId]);
  return { c, shipmentId, taskId: r!.taskId!, movementId: r!.movementId! };
}

async function standAlone() {
  const c = randomUUID();
  const { task, movement } = await warehouseImportService.createPosition(c, user, { customer: "Walk-in Ltd" });
  return { c, taskId: task.id, movementId: movement.id };
}

describe("sections stored per position", () => {
  it("works for a stand-alone position: notes, lines and a logged save", async () => {
    const { c, taskId, movementId } = await standAlone();
    expect(await warehouseService.getSectionByTask(taskId, "job", c)).toBeNull();
    const row = await byTask(c, taskId, [
      { key: "notes", value: "two pallets crushed", expected: "" },
      { key: "remeasure_rows", value: JSON.stringify([{ pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "250" }]), expected: "" },
    ]);
    expect(row).toMatchObject({ taskId, shipmentId: null, version: 1 });
    expect((await warehouseService.getSectionByTask(taskId, "job", c))!.id).toBe(row.id);
    const m = await gateMovementService.get(movementId, c);
    expect(m.events.at(-1)).toMatchObject({ kind: "sectionSaved", label: "Shipment Details saved: notes, remeasured lines" });
    await expect(warehouseService.getSectionByTask(randomUUID(), "job", c)).rejects.toThrow(/not found/);
    await expect(warehouseService.getSectionByTask(taskId, "job", randomUUID())).rejects.toThrow(/not found/);
  });

  it("lets Shipments keep reading and saving by shipment id: it is the position's row", async () => {
    const { c, shipmentId, taskId } = await linked();
    const saved = await byShipment(c, shipmentId, [{ key: "notes", value: "from Shipments", expected: "" }]);
    expect(saved).toMatchObject({ taskId, shipmentId });
    expect((await warehouseService.getSection(shipmentId, "job", c))!.id).toBe(saved.id);
    const again = await byTask(c, taskId, [{ key: "notes", value: "from the warehouse", expected: "from Shipments" }]);
    expect(again.id).toBe(saved.id);
    expect((await warehouseService.getSection(shipmentId, "job", c))!.data).toMatchObject({ notes: "from the warehouse" });
  });

  it("still reads a legacy row of a shipment with no position, and the position takes it over on its first save", async () => {
    const c = randomUUID();
    const shipmentId = randomUUID();
    const legacy = await byShipment(c, shipmentId, [{ key: "notes", value: "legacy", expected: "" }]);
    expect(legacy).toMatchObject({ taskId: null, shipmentId });
    const { taskId } = await linked(c, shipmentId);
    // Before its first save the position shows the shipment's row …
    expect((await warehouseService.getSectionByTask(taskId, "job", c))!.id).toBe(legacy.id);
    expect((await warehouseService.getSection(shipmentId, "job", c))!.id).toBe(legacy.id);
    // … and takes it over (same row, nothing lost).
    const row = await byTask(c, taskId, [{ key: "remeasure_rows", value: "[]", expected: "" }]);
    expect(row).toMatchObject({ id: legacy.id, taskId, data: { notes: "legacy", remeasure_rows: "[]" } });
  });

  it("backfills the position of existing rows (migration 0015), leaving the pick-up keyed to the shipment", async () => {
    const { c, shipmentId, taskId } = await linked();
    await db.insert(warehouseSectionTable).values([
      { companyId: c, shipmentId, section: "job", data: { notes: "old" } },
      { companyId: c, shipmentId, section: "pickup", data: { rows: "[]" } },
    ]);
    await db.execute(sql.raw(migrationBackfill()));
    const rows = await db.select().from(warehouseSectionTable).where(and(eq(warehouseSectionTable.companyId, c)));
    expect(rows.find((r) => r.section === "job")!.taskId).toBe(taskId);
    expect(rows.find((r) => r.section === "pickup")!.taskId).toBeNull();
    // Running it again — or the repository's copy — changes nothing for this company.
    await db.execute(sql.raw(migrationBackfill()));
    await warehouseSectionRepository.backfillTaskIds();
    const again = await db.select().from(warehouseSectionTable).where(and(eq(warehouseSectionTable.companyId, c)));
    expect(again.map((r) => [r.section, r.taskId, r.version]).sort()).toEqual(rows.map((r) => [r.section, r.taskId, r.version]).sort());
    expect((await warehouseService.getSectionByTask(taskId, "job", c))!.data).toEqual({ notes: "old" });
  });

  it("keeps both fields of two first saves at once, and still refuses a stale save", async () => {
    const { c, taskId } = await standAlone();
    await Promise.all([
      byTask(c, taskId, [{ key: "notes", value: "fragile", expected: "" }]),
      byTask(c, taskId, [{ key: "vgm_sent", value: "x", expected: "" }]),
    ]);
    const row = (await warehouseService.getSectionByTask(taskId, "job", c))!;
    expect(row.data).toEqual({ notes: "fragile", vgm_sent: "x" });
    expect(row.version).toBe(2);
    await expect(byTask(c, taskId, [{ key: "notes", value: "other", expected: "" }])).rejects.toThrow(/Changed meanwhile: notes/);
  });

  it("marks as sent with a resend history; two sends at once both stay", async () => {
    const { c, taskId, movementId } = await standAlone();
    await Promise.all([
      warehouseService.markSent(taskId, "remeasurement", "to the carrier", c, user),
      warehouseService.markSent(taskId, "remeasurement", "again", c, user),
    ]);
    const row = (await warehouseService.getSectionByTask(taskId, "job", c))!;
    const data = row.data as Record<string, unknown>;
    expect(JSON.parse(data.remeasurement_sent as string)).toMatchObject({ timestamp: expect.any(String) });
    expect((data.remeasurement_sent_history as { note: string }[]).map((h) => h.note).sort()).toEqual(["again", "to the carrier"]);
    await warehouseService.markSent(taskId, "inform_operations", "", c, user);
    const informed = ((await warehouseService.getSectionByTask(taskId, "job", c))!.data as Record<string, string>).inform_operations_sent;
    expect(informed).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await expect(warehouseService.markSent(taskId, "invoice", "", c, user)).rejects.toThrow(/must be one of/);
    const events = (await gateMovementService.get(movementId, c)).events.filter((e) => e.kind === "sectionSent");
    expect(events).toHaveLength(3);
    const summary = (await warehouseService.sectionSummary(c)).find((s) => s.taskId === taskId)!;
    expect(summary).toMatchObject({ hasLines: false, remeasurementSentAt: expect.any(String), operationsInformedAt: informed });
  });

  it("gives the remeasurement worklist the lines saved per position", async () => {
    const { c, taskId } = await standAlone();
    await byTask(c, taskId, [{ key: "remeasure_rows", value: JSON.stringify([{ pieces: "1" }, { pieces: "2" }]), expected: "" }]);
    expect((await warehouseService.sectionSummary(c)).find((s) => s.taskId === taskId)).toMatchObject({
      hasLines: true,
      lineCount: 2,
      linesSavedAt: expect.any(String),
      remeasurementSentAt: null,
    });
  });

  it("keeps the pick-up section and its PIN keyed to the shipment", async () => {
    const { c, shipmentId, taskId } = await linked();
    await gateMovementService.generatePickupPin(shipmentId, c, user);
    const pickup = (await warehouseService.getSection(shipmentId, "pickup", c))!;
    expect(pickup.taskId).toBeNull();
    expect(readPickup(pickup.data).pin).toMatch(/^\d{6}$/);
    expect((await warehouseService.getSectionByTask(taskId, "pickup", c))!.id).toBe(pickup.id);
    await expect(warehouseService.patchSectionByTask(taskId, "pickup", c, [{ key: "pin", value: "1", expected: "" }])).rejects.toThrow(/not saved field by field/);
  });

  it("lets a shipment imported again take over the notes of its removed position", async () => {
    const { c, shipmentId, taskId } = await linked();
    await byTask(c, taskId, [{ key: "notes", value: "kept", expected: "" }]);
    await gateAdminService.removePosition(taskId, c, user, "user");
    expect((await warehouseService.getSection(shipmentId, "job", c))!.data).toMatchObject({ notes: "kept" });
    const again = await linked(c, shipmentId);
    expect(again.taskId).not.toBe(taskId);
    expect((await warehouseService.getSectionByTask(again.taskId, "job", c))!.data).toMatchObject({ notes: "kept" });
    expect(await byTask(c, again.taskId, [{ key: "notes", value: "new", expected: "kept" }])).toMatchObject({ taskId: again.taskId });
  });
});
