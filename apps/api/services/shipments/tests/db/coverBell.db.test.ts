import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: {}, quotes: {}, warehouse: {} }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../../../lib/companyUsers", async (original) => ({ ...(await original<object>()), userEmailOf: async () => "eva@firma.cz" }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));

import { db } from "../../db/db";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentAuditTable } from "../../schemas/shipmentAudit.schema";
import { shipmentNoteTable } from "../../schemas/shipmentNote.schema";
import { coverBellService } from "../../services/coverBell.service";

// Migration 0084 against the shipments database: the bell's "To-dos on shipments you now cover"
// and the Notes To-Do tab's read mark. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const EVA = randomUUID();
const JAN = randomUUID();

const newShipment = async (over: Partial<typeof shipmentTable.$inferInsert> = {}) => {
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId: randomUUID(), jobNumber: "CZ00000001", tradeDirection: "Import", personInCharge: "jan@firma.cz", holidayCover: "eva@firma.cz", ...over })
    .returning();
  return row!;
};
const madeCover = (s: { id: string; companyId: string }, by = JAN, changedAt = new Date()) =>
  db.insert(shipmentAuditTable).values({ companyId: s.companyId, shipmentId: s.id, userId: by, field: "holidayCover", oldValue: "", newValue: "eva@firma.cz", changedAt });
const todo = (s: { id: string; companyId: string }, text: string, over: Partial<typeof shipmentNoteTable.$inferInsert> = {}) =>
  db.insert(shipmentNoteTable).values({ companyId: s.companyId, shipmentId: s.id, text, ...over });

describe("to-dos on shipments you now cover", () => {
  it("lists a shipment somebody else made you cover with its open to-dos, until you open its Notes To-Do tab", async () => {
    const s = await newShipment();
    await madeCover(s);
    await todo(s, "Call the depot");
    await todo(s, "Book the truck", { doneAt: new Date() });
    await todo(s, "Old one", { deletedAt: new Date() });
    expect(await coverBellService.forMe(s.companyId, EVA)).toMatchObject([{ shipmentId: s.id, role: "Holiday Cover", openCount: 1, titles: ["Call the depot"] }]);
    // Another company sees nothing of it.
    expect(await coverBellService.forMe(randomUUID(), EVA)).toEqual([]);
    await coverBellService.markRead(s.id, s.companyId, EVA);
    expect(await coverBellService.forMe(s.companyId, EVA)).toEqual([]);
    // Made it again later: listed again, and read again.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await madeCover(s, JAN);
    expect(await coverBellService.forMe(s.companyId, EVA)).toHaveLength(1);
    await coverBellService.markRead(s.id, s.companyId, EVA);
    expect(await coverBellService.forMe(s.companyId, EVA)).toEqual([]);
  });

  it("lists nothing for a change you made yourself, a shipment with nothing open, deleted or cancelled, or one you no longer cover", async () => {
    const own = await newShipment();
    await madeCover(own, EVA);
    await todo(own, "Mine");
    const nothingOpen = await newShipment({ companyId: own.companyId, jobNumber: "CZ00000002" });
    await madeCover(nothingOpen);
    const cancelled = await newShipment({ companyId: own.companyId, jobNumber: "CZ00000003", status: "Cancelled Shipment" });
    await madeCover(cancelled);
    await todo(cancelled, "Gone with it");
    const moved = await newShipment({ companyId: own.companyId, jobNumber: "CZ00000004" });
    await madeCover(moved);
    await todo(moved, "Someone else's now");
    await db.update(shipmentTable).set({ holidayCover: "ana@firma.cz" }).where(eq(shipmentTable.id, moved.id));
    const deleted = await newShipment({ companyId: own.companyId, jobNumber: "CZ00000005" });
    await madeCover(deleted);
    await todo(deleted, "Deleted with it");
    await db.update(shipmentTable).set({ deletedAt: new Date() }).where(eq(shipmentTable.id, deleted.id));
    expect(await coverBellService.forMe(own.companyId, EVA)).toEqual([]);
  });

  it("refuses the read mark of a shipment of another company", async () => {
    const s = await newShipment();
    await expect(coverBellService.markRead(s.id, randomUUID(), EVA)).rejects.toThrow("Shipment not found");
  });
});
