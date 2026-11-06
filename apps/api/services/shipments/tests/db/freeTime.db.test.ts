import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: { openInvoiceCount: async () => ({ count: 0 }) }, quotes: {}, warehouse: { _internalPickupPlates: async () => ({ plates: [] }) } }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));

import { db } from "../../db/db";
import { containerRepository } from "../../repositories/container.repository";
import { shipmentTrackingEventRepository } from "../../repositories/shipmentTrackingEvent.repository";
import { containerTable } from "../../schemas/container.schema";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentTable } from "../../schemas/shipment.schema";
import { trackingAttentionService } from "../../services/trackingAttention.service";
import { trackingService } from "../../services/tracking.service";

// The free time clock against the shipments database, migration 0068 included. Runs only under
// `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();
const NOW = new Date("2026-11-10T12:00:00Z");
let jobs = 100;

const newJob = async (companyId: string = randomUUID(), containerNumber = "CSQU3054383", over: object = {}) => {
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight", ...over })
    .returning();
  await containerRepository.syncForShipment(row!.id, companyId, [{ containerNumber, sealNumber: "", type: "", teu: "", packages: "", packageType: "", grossWeight: "", volume: "" }]);
  const [box] = await containerRepository.listByShipmentId(row!.id, companyId);
  return { id: row!.id, companyId, box: box!, actor: { userID: USER, companyID: companyId, role: "admin" } };
};
const discharged = (s: { id: string; companyId: string }, occurredOn: string) => shipmentTrackingEventRepository.add({ companyId: s.companyId, shipmentId: s.id, kind: "discharged", occurredOn });

describe("free time", () => {
  it("starts empty, counting from discharge", async () => {
    const s = await newJob();
    expect(s.box).toMatchObject({ freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: null });
  });

  it("is written on the box and logged, and the Tracking tab counts it from the event", async () => {
    const s = await newJob();
    await discharged(s, "2026-11-01");
    await trackingService.setFreeTime(s.id, s.actor, { containerIds: [s.box.id], freeTimeDays: 5, freeTimeFrom: "discharge", lastFreeDay: null });
    const tracking = await trackingService.get(s.id, s.actor, NOW);
    expect(tracking.containerClocks).toMatchObject([{ containerNumber: "CSQU3054383", freeTimeDays: 5, state: "chargeable", lastFreeDay: "2026-11-06", chargeableDays: 4 }]);
    const log = await db.select().from(shipmentAuditTable).where(and(eq(shipmentAuditTable.shipmentId, s.id), eq(shipmentAuditTable.field, "freeTime")));
    expect(log).toMatchObject([{ oldValue: "CSQU3054383: none", newValue: "CSQU3054383: 5 d from discharge" }]);
    expect(tracking.changes.find((c) => c.label === "Free time")).toBeDefined();
  });

  it("survives the Container Details tab saving its rows", async () => {
    const s = await newJob();
    await trackingService.setFreeTime(s.id, s.actor, { containerIds: [s.box.id], freeTimeDays: 7, freeTimeFrom: "gate_out", lastFreeDay: "2026-11-20" });
    await containerRepository.syncForShipment(s.id, s.companyId, [{ id: s.box.id, containerNumber: "CSQU3054383", sealNumber: "S1", type: "", teu: "", packages: "", packageType: "", grossWeight: "", volume: "" }]);
    const [row] = await db.select().from(containerTable).where(eq(containerTable.id, s.box.id));
    expect(row).toMatchObject({ sealNumber: "S1", freeTimeDays: 7, freeTimeFrom: "gate_out", lastFreeDay: "2026-11-20" });
  });

  it("refuses a box of another job", async () => {
    const s = await newJob();
    const other = await newJob(s.companyId, "MSKU1234565");
    await expect(trackingService.setFreeTime(s.id, s.actor, { containerIds: [other.box.id], freeTimeDays: 5, freeTimeFrom: "discharge", lastFreeDay: null })).rejects.toThrow("own containers");
    const [row] = await db.select().from(containerTable).where(eq(containerTable.id, other.box.id));
    expect(row!.freeTimeDays).toBeNull();
  });

  it("takes a notice's last free day", async () => {
    const s = await newJob();
    const preview = await trackingService.previewReading(s.id, s.companyId, { "Last Free Day": "2026-11-15", "Container Numbers": "CSQU3054383" }, NOW);
    expect(preview.lastFreeDayChange).toEqual({ day: "2026-11-15", containerIds: [s.box.id], containerNumbers: ["CSQU3054383"] });
    await trackingService.keepReading(s.id, s.actor, { facts: [], lastFreeDay: { day: "2026-11-15", containerIds: [s.box.id] } }, NOW);
    const tracking = await trackingService.get(s.id, s.actor, NOW);
    expect(tracking.containerClocks).toMatchObject([{ lastFreeDayStated: "2026-11-15", lastFreeDay: "2026-11-15", state: "running", daysLeft: 5 }]);
  });

  it("gives the warehouse the latest job's date for a number, and none once the empty went back", async () => {
    const companyId = randomUUID();
    const older = await newJob(companyId, "AAAU1111111");
    await trackingService.setFreeTime(older.id, older.actor, { containerIds: [older.box.id], freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: "2026-01-15" });
    const newer = await newJob(companyId, "AAAU1111111");
    const running = await newJob(companyId, "BBBU2222222");
    await trackingService.setFreeTime(running.id, running.actor, { containerIds: [running.box.id], freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: "2026-11-20" });
    const back = await newJob(companyId, "CCCU3333333");
    await trackingService.setFreeTime(back.id, back.actor, { containerIds: [back.box.id], freeTimeDays: null, freeTimeFrom: "discharge", lastFreeDay: "2026-11-20" });
    await shipmentTrackingEventRepository.add({ companyId, shipmentId: back.id, kind: "empty_returned", occurredOn: "2026-11-09" });
    expect(newer.box.freeTimeDays).toBeNull();
    await expect(trackingService.freeTimeByContainer(companyId, ["AAAU1111111", "BBBU2222222", "CCCU3333333"], NOW)).resolves.toEqual([{ containerNumber: "BBBU2222222", lastFreeDay: "2026-11-20" }]);
  });

  it("puts a box past its free time on the cockpit's tracking card", async () => {
    const s = await newJob(randomUUID(), "CSQU3054383", { status: "Arrived [IMP]" });
    await discharged(s, "2026-11-01");
    await trackingService.setFreeTime(s.id, s.actor, { containerIds: [s.box.id], freeTimeDays: 5, freeTimeFrom: "discharge", lastFreeDay: null });
    const { items } = await trackingAttentionService.list(s.companyId, NOW);
    expect(items[0]!.flags).toContainEqual(expect.objectContaining({ kind: "free_time", severity: "urgent", label: "Free time over", detail: "CSQU3054383 4 d over" }));
  });
});
