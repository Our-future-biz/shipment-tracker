import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const customersClient = vi.hoisted(() => ({ _internalNoteFromShipment: vi.fn() }));
vi.mock("~encore/clients", () => ({ auth: {}, customers: customersClient, invoicing: {}, quotes: {}, warehouse: {} }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../../../lib/companyUsers", async (original) => ({ ...(await original<object>()), userEmailOf: async () => "jan@firma.cz" }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));

import { db } from "../../db/db";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentAttachmentRepository } from "../../repositories/shipmentAttachment.repository";
import { trackingBellRepository } from "../../repositories/trackingBell.repository";
import { customerNoticeService } from "../../services/customerNotice.service";
import { trackingBellService } from "../../services/trackingBell.service";

// Migration 0066 against the shipments database: what was told, what the bell reads from it. Runs
// only under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();
const COLLEAGUE = randomUUID();

const newShipment = async (over: Partial<typeof shipmentTable.$inferInsert> = {}) => {
  const companyId = randomUUID();
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: "CZ00000001", tradeDirection: "Import", personInCharge: "jan@firma.cz", estimatedArrival: "2026-12-09", ...over })
    .returning();
  return row!;
};

describe("what the customer was told", () => {
  it("keeps the dates as they stand", async () => {
    const s = await newShipment();
    const row = await customerNoticeService.record(s.id, s.companyId, USER, { kind: "status", channel: "email", toldTo: "jana@alza.cz" });
    expect(row).toMatchObject({ etaPod: "2026-12-09", toldById: USER, kind: "status" });
  });

  it("the database refuses an unknown kind or channel", async () => {
    const s = await newShipment();
    await expect(customerNoticeService.record(s.id, s.companyId, USER, { kind: "gossip", channel: "email" })).rejects.toThrow();
  });

  it("the bell says so when a date told has moved, until the customer is told again", async () => {
    const s = await newShipment();
    await customerNoticeService.record(s.id, s.companyId, USER, { kind: "status", channel: "email" });
    expect((await trackingBellService.notices(s.companyId, USER)).filter((n) => n.kind === "not_told")).toEqual([]);
    await db.update(shipmentTable).set({ estimatedArrival: "2026-12-16" }).where(eq(shipmentTable.id, s.id));
    expect((await trackingBellService.notices(s.companyId, USER)).filter((n) => n.kind === "not_told")).toMatchObject([{ text: "ETA: told 09.12.2026, now 16.12.2026", unread: true }]);
    await customerNoticeService.record(s.id, s.companyId, USER, { kind: "eta_change", channel: "phone" });
    expect((await trackingBellService.notices(s.companyId, USER)).filter((n) => n.kind === "not_told")).toEqual([]);
  });
});

describe("the bell's read mark", () => {
  it("makes a moved date read, and a later move new again", async () => {
    const s = await newShipment();
    const move = (newValue: string) =>
      db.insert(shipmentAuditTable).values({ companyId: s.companyId, shipmentId: s.id, userId: COLLEAGUE, field: "estimatedArrival", oldValue: "2026-12-09", newValue, changedAt: new Date() });
    await move("2026-12-16");
    expect((await trackingBellService.notices(s.companyId, USER))[0]).toMatchObject({ kind: "date_moved", unread: true });
    await trackingBellRepository.markRead(s.companyId, USER, s.id);
    await trackingBellRepository.markRead(s.companyId, USER, s.id);
    expect((await trackingBellService.notices(s.companyId, USER))[0]).toMatchObject({ kind: "date_moved", unread: false });
    await move("2026-12-20");
    expect((await trackingBellService.notices(s.companyId, USER))[0]).toMatchObject({ kind: "date_moved", unread: true, text: "09.12.2026 → 20.12.2026" });
  });

  it("isn't told of one's own move, or of a shipment that isn't one's own", async () => {
    const mine = await newShipment();
    await db.insert(shipmentAuditTable).values({ companyId: mine.companyId, shipmentId: mine.id, userId: USER, field: "estimatedArrival", oldValue: "2026-12-09", newValue: "2026-12-16" });
    expect(await trackingBellService.notices(mine.companyId, USER)).toEqual([]);
    const others = await newShipment({ personInCharge: "eva@firma.cz" });
    await db.insert(shipmentAuditTable).values({ companyId: others.companyId, shipmentId: others.id, userId: COLLEAGUE, field: "estimatedArrival", oldValue: "2026-12-09", newValue: "2026-12-16" });
    expect(await trackingBellService.notices(others.companyId, USER)).toEqual([]);
  });
});

describe("a file handed over by another module", () => {
  it("is stored once per source", async () => {
    const s = await newShipment();
    const row = { companyId: s.companyId, shipmentId: s.id, fileName: "pod.pdf", fileSize: 1, fileType: "application/pdf", storageKey: "x", documentType: "CMR / POD", uploadedById: USER, sourceRef: "trucking:abc" };
    expect(await shipmentAttachmentRepository.addOnce(row)).toBe(true);
    expect(await shipmentAttachmentRepository.addOnce({ ...row, storageKey: "y" })).toBe(false);
    expect(await shipmentAttachmentRepository.findBySourceRef(s.id, s.companyId, "trucking:abc")).toMatchObject({ storageKey: "x" });
  });

  it("uploads without a source can repeat", async () => {
    const s = await newShipment();
    const row = { companyId: s.companyId, shipmentId: s.id, fileName: "a.pdf", fileSize: 1, fileType: "", storageKey: "x", documentType: "", uploadedById: USER };
    await shipmentAttachmentRepository.addOnce(row);
    expect(await shipmentAttachmentRepository.addOnce(row)).toBe(true);
  });
});
