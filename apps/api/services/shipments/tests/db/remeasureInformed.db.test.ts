import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// The warehouse's Inform Operations against the shipments database: its chat message and the record
// the Alerts tab lists are saved together, and the list says how the figures stand (owner decision,
// 18 Nov 2026: more or less → an Alert; the same → only the message, in Notifications). Runs only
// under `encore test` (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).
vi.mock("~encore/clients", () => ({
  auth: { usersList: async () => ({ users: [] }) },
  customers: {},
  invoicing: { openInvoiceCount: async () => ({ count: 0 }), _internalPaidSupplierInvoices: async () => ({ invoiceNumbers: [] }), _internalInvoicedShipments: async () => ({ shipmentIds: [] }) },
  quotes: {},
  warehouse: { _internalPickupPlates: async () => ({ plates: [] }) },
}));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));

import { db } from "../../db/db";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentCommentTable } from "../../schemas/shipmentComment.schema";
import { shipmentCommentRepository } from "../../repositories/shipmentComment.repository";
import { shipmentAuditRepository } from "../../repositories/shipmentAudit.repository";
import { shipmentService } from "../../services/shipment.service";
import { commentService } from "../../services/comment.service";
import { alertService } from "../../services/alert.service";

const USER = randomUUID();
let jobs = 100;

// CZLCL00000052: 1 piece 120×80×100 cm, 300 kg on Cargo Details.
const newShipment = async () => {
  const companyId = randomUUID();
  const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZRI${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight" }).returning();
  const line = { containerId: null, pieces: "1", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "300", volumePerPcM3: "", packageType: "", stackable: "" };
  await shipmentService.update(row!.id, companyId, { cargoDimensions: [line] }, USER, "admin");
  return { id: row!.id, companyId };
};
const messagesOf = (shipmentId: string) => db.select().from(shipmentCommentTable).where(eq(shipmentCommentTable.shipmentId, shipmentId));

describe("the warehouse's Inform Operations", () => {
  it("saves the chat message and its record, and lists a difference first-newest with by how much", async () => {
    const s = await newShipment();
    await commentService.postRemeasureNotice(s.id, s.companyId, USER, { remeasured: { colli: 1, weightKg: 300, volumeCbm: 0.96 }, comparedWith: "dimensions", note: "" });
    await new Promise((r) => setTimeout(r, 5));
    await commentService.postRemeasureNotice(s.id, s.companyId, USER, { remeasured: { colli: 1, weightKg: 500, volumeCbm: 6.292 }, comparedWith: "dimensions", note: "" });

    const messages = await messagesOf(s.id);
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.message).join("\n")).toContain("The remeasured values match the shipment values.");
    expect(messages.map((m) => m.message).join("\n")).toContain("Difference: weight +200.0 kg · volume +5.332 CBM");

    const informed = await alertService.remeasureInformed(s.id, s.companyId);
    expect(informed).toMatchObject([
      { verdict: "differs", difference: "weight +200.0 kg · volume +5.332 CBM", comparedWith: "dimensions", shipment: { colli: 1, weightKg: 300, volumeCbm: 0.96 }, remeasured: { weightKg: 500 } },
      { verdict: "matches", difference: "" },
    ]);
  });

  it("saves neither when the record can't be written", async () => {
    const s = await newShipment();
    vi.spyOn(shipmentAuditRepository, "create").mockRejectedValueOnce(new Error("history write failed"));
    await expect(
      shipmentCommentRepository.createWithHistory(s.companyId, { shipmentId: s.id, authorId: USER, message: "x", mentionedUserIds: [] }, () => ({ field: "remeasureInformed", oldValue: null, newValue: null })),
    ).rejects.toThrow("history write failed");
    expect(await messagesOf(s.id)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("lists nothing for a shipment never informed, and refuses one that does not exist", async () => {
    const s = await newShipment();
    expect(await alertService.remeasureInformed(s.id, s.companyId)).toEqual([]);
    await expect(alertService.remeasureInformed(randomUUID(), s.companyId)).rejects.toThrow(/not found/i);
  });
});
