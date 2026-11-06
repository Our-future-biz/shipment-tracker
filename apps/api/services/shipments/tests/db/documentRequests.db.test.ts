import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

vi.mock("~encore/clients", () => ({ auth: {}, customers: {}, invoicing: { openInvoiceCount: async () => ({ count: 0 }) }, quotes: {}, warehouse: { _internalPickupPlates: async () => ({ plates: [] }) } }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map() }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async () => ({ userID: "svc" }) }));

import { db } from "../../db/db";
import { shipmentTable } from "../../schemas/shipment.schema";
import { shipmentAttachmentTable } from "../../schemas/shipmentAttachment.schema";
import { documentChangeRequestTable } from "../../schemas/documentChangeRequest.schema";
import { customsOfficeRequestTable } from "../../schemas/customsOfficeRequest.schema";
import { DocumentNoLongerApproved, documentChangeRequestRepository as requests } from "../../repositories/documentChangeRequest.repository";
import { customsOfficeRequestRepository } from "../../repositories/customsOfficeRequest.repository";
import { shipmentAttachmentRepository } from "../../repositories/shipmentAttachment.repository";

// The SQL the document and customs office requests rely on, against the shipments database:
// one waiting request per document, an answer given once, the approval's swap in one transaction,
// and an approved document left alone by a regular user's write. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db).

const USER = randomUUID();
let jobs = 600;

async function approvedDocument() {
  const companyId = randomUUID();
  const [shipment] = await db.insert(shipmentTable).values({ companyId, jobNumber: `CZ${jobs++}`, tradeDirection: "Import", freightMode: "Sea Freight" }).returning();
  const [doc] = await db
    .insert(shipmentAttachmentTable)
    .values({ companyId, shipmentId: shipment!.id, fileName: "old.pdf", storageKey: "old-key", documentType: "Invoice", customsStatus: "approved" })
    .returning();
  const request = await requests.create({
    companyId,
    shipmentId: shipment!.id,
    attachmentId: doc!.id,
    fileName: "old.pdf",
    documentType: "Invoice",
    newFileName: "new.pdf",
    newStorageKey: "new-key",
    reason: "Wrong invoice",
    requestedById: USER,
  });
  return { companyId, shipmentId: shipment!.id, docId: doc!.id, requestId: request!.id };
}

const decision = () => ({ decidedById: USER, decidedByName: "Jana", decidedAt: new Date(), comment: "" });
const replacement = { fileName: "new.pdf", fileSize: 3, fileType: "application/pdf", storageKey: "new-key", documentType: "Invoice", uploadedById: USER };
const liveDocs = (shipmentId: string) =>
  db.select().from(shipmentAttachmentTable).where(and(eq(shipmentAttachmentTable.shipmentId, shipmentId), isNull(shipmentAttachmentTable.deletedAt)));
const statusOf = async (id: string) => (await db.select().from(documentChangeRequestTable).where(eq(documentChangeRequestTable.id, id)))[0]!.status;

describe("a request to change an approved document", () => {
  it("waits once per document", async () => {
    const { companyId, shipmentId, docId } = await approvedDocument();
    const second = await requests.create({ companyId, shipmentId, attachmentId: docId, fileName: "old.pdf", newFileName: "b.pdf", newStorageKey: "b", reason: "Again", requestedById: USER });
    expect(second).toBeNull();
  });

  it("approved, swaps the documents in one turn: the new one at pending, the old one out of the lists", async () => {
    const { companyId, shipmentId, docId, requestId } = await approvedDocument();
    const row = await requests.approveWithSwap(requestId, companyId, decision(), { attachmentId: docId, shipmentId }, replacement);
    expect(row?.status).toBe("approved");
    const docs = await liveDocs(shipmentId);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ fileName: "new.pdf", storageKey: "new-key", customsStatus: "", documentType: "Invoice", companyId });
  });

  it("is answered once: a second approval or a rejection after it writes nothing", async () => {
    const { companyId, shipmentId, docId, requestId } = await approvedDocument();
    await requests.approveWithSwap(requestId, companyId, decision(), { attachmentId: docId, shipmentId }, replacement);
    await expect(requests.approveWithSwap(requestId, companyId, decision(), { attachmentId: docId, shipmentId }, replacement)).resolves.toBeNull();
    await expect(requests.answer(requestId, companyId, { status: "rejected", ...decision() })).resolves.toBeNull();
    expect(await liveDocs(shipmentId)).toHaveLength(1);
    expect(await statusOf(requestId)).toBe("approved");
  });

  it("leaves everything as it was when the document stopped being approved meanwhile", async () => {
    const { companyId, shipmentId, docId, requestId } = await approvedDocument();
    await db.update(shipmentAttachmentTable).set({ customsStatus: "declined" }).where(eq(shipmentAttachmentTable.id, docId));
    await expect(requests.approveWithSwap(requestId, companyId, decision(), { attachmentId: docId, shipmentId }, replacement)).rejects.toBeInstanceOf(DocumentNoLongerApproved);
    expect(await statusOf(requestId)).toBe("pending");
    const docs = await liveDocs(shipmentId);
    expect(docs.map((d) => d.id)).toEqual([docId]);
  });

  it("is never another company's to answer", async () => {
    const { shipmentId, docId, requestId } = await approvedDocument();
    await expect(requests.approveWithSwap(requestId, randomUUID(), decision(), { attachmentId: docId, shipmentId }, replacement)).resolves.toBeNull();
    expect(await statusOf(requestId)).toBe("pending");
  });

  it("refuses a status outside pending, approved and rejected", async () => {
    const { companyId, requestId } = await approvedDocument();
    await expect(db.update(documentChangeRequestTable).set({ status: "maybe" as "pending" }).where(eq(documentChangeRequestTable.id, requestId))).rejects.toThrow();
    await expect(
      db.insert(customsOfficeRequestTable).values({ companyId, shipmentId: randomUUID(), fromOffice: "a", toOffice: "b", reason: "x", requestedById: USER }),
    ).rejects.toThrow();
  });
});

describe("an approved document under a regular user's write", () => {
  it("keeps its type and its review", async () => {
    const { companyId, shipmentId, docId } = await approvedDocument();
    await expect(shipmentAttachmentRepository.updateReview(docId, shipmentId, companyId, { documentType: "Other" }, { unlessApproved: true })).resolves.toBeNull();
    await expect(shipmentAttachmentRepository.updateReview(docId, shipmentId, companyId, { customsStatus: "" }, { unlessApproved: true })).resolves.toBeNull();
    const [doc] = await db.select().from(shipmentAttachmentTable).where(eq(shipmentAttachmentTable.id, docId));
    expect(doc).toMatchObject({ documentType: "Invoice", customsStatus: "approved" });
    // A manager's write (no guard) still goes through.
    await expect(shipmentAttachmentRepository.updateReview(docId, shipmentId, companyId, { documentType: "Other" })).resolves.toMatchObject({ documentType: "Other" });
  });
});

describe("a request to change a Customs Office", () => {
  it("waits once per shipment and is answered once", async () => {
    const { companyId, shipmentId } = await approvedDocument();
    const ask = () => customsOfficeRequestRepository.create({ companyId, shipmentId, fromOffice: "CZ510000 A", toOffice: "CZ520000 B", reason: "Moved", requestedById: USER });
    const first = await ask();
    expect(first).not.toBeNull();
    await expect(ask()).resolves.toBeNull();
    const answer = { decidedById: USER, decidedByName: "Jana", decidedAt: new Date(), comment: "" };
    await expect(customsOfficeRequestRepository.answer(first!.id, companyId, { status: "approved", ...answer })).resolves.toMatchObject({ status: "approved" });
    await expect(customsOfficeRequestRepository.answer(first!.id, companyId, { status: "rejected", ...answer, comment: "No" })).resolves.toBeNull();
  });
});
