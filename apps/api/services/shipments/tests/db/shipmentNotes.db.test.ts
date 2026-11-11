import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: { openInvoiceCount: async () => ({ count: 0 }) }, quotes: {}, warehouse: { _internalPickupPlates: async () => ({ plates: [] }) } }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));

import { db } from "../../db/db";
import { shipmentNoteRepository } from "../../repositories/shipmentNote.repository";
import { shipmentTable } from "../../schemas/shipment.schema";
import { noteService } from "../../services/note.service";
import { eq } from "drizzle-orm";

// The shipment's to-do list against the shipments database (migrations 0077-0080). Runs only
// under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

let jobs = 900;
const newJob = async () => {
  const companyId = randomUUID();
  const [row] = await db
    .insert(shipmentTable)
    .values({ companyId, jobNumber: `CZN${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight" })
    .returning();
  return { id: row!.id, companyId };
};

describe("shipment to-dos", () => {
  it("keeps who ticked a to-do off and when, when it is ticked off again", async () => {
    const s = await newJob();
    const [eva, jan] = [randomUUID(), randomUUID()];
    const note = await noteService.create(s.id, s.companyId, eva, { text: "Call the depot" });

    const first = await noteService.update(s.id, note.id, s.companyId, eva, { done: true });
    expect(first.done).toBe(true);
    const [firstRow] = await shipmentNoteRepository.listByShipmentId(s.id, s.companyId);
    expect(firstRow).toMatchObject({ doneById: eva });

    // Somebody else's page still shows it open: their tick changes nothing of the first one.
    await noteService.update(s.id, note.id, s.companyId, jan, { done: true });
    const [again] = await shipmentNoteRepository.listByShipmentId(s.id, s.companyId);
    expect(again).toMatchObject({ doneById: eva, doneAt: firstRow!.doneAt });

    // Ticked back and off again: the new tick is the one that stands.
    await noteService.update(s.id, note.id, s.companyId, eva, { done: false });
    const [reopened] = await shipmentNoteRepository.listByShipmentId(s.id, s.companyId);
    expect(reopened).toMatchObject({ doneAt: null, doneById: null });
    await noteService.update(s.id, note.id, s.companyId, jan, { done: true });
    const [byJan] = await shipmentNoteRepository.listByShipmentId(s.id, s.companyId);
    expect(byJan).toMatchObject({ doneById: jan });
  });

  it("changes no to-do of a deleted shipment", async () => {
    const s = await newJob();
    const note = await noteService.create(s.id, s.companyId, randomUUID(), { text: "Book the truck" });
    await db.update(shipmentTable).set({ deletedAt: new Date() }).where(eq(shipmentTable.id, s.id));
    await expect(noteService.update(s.id, note.id, s.companyId, randomUUID(), { done: true })).rejects.toThrow("Shipment not found");
    await expect(noteService.delete(s.id, note.id, s.companyId)).rejects.toThrow("Shipment not found");
  });

  it("keeps another company's to-do out of reach", async () => {
    const s = await newJob();
    const note = await noteService.create(s.id, s.companyId, randomUUID(), { text: "Send the SI" });
    const other = await newJob();
    await expect(noteService.update(other.id, note.id, other.companyId, randomUUID(), { text: "Hijacked" })).rejects.toThrow("Note not found");
    const [row] = await shipmentNoteRepository.listByShipmentId(s.id, s.companyId);
    expect(row!.text).toBe("Send the SI");
  });
});
