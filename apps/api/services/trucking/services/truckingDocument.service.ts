import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { inTx } from "../db/db";
import { truckingDocumentRepository } from "../repositories/truckingDocument.repository";
import { appendEvent } from "../repositories/event.repository";
import { truckingDocumentBucket } from "../storage/documentBucket";
import type { TruckingDocumentRecord } from "../schemas/truckingConsignment.schema";
import type { FileDownload, TruckingDocumentItem } from "../interfaces/interfaces";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import { servedFileType } from "../../warehouse/services/fileType";
import { checkUpload, documentKind, type CheckedFile } from "../lib/truckingFiles";
import { userName } from "../lib/users";
import { consignmentService } from "./consignment.service";
import type { Tx } from "../db/db";

// Consignment documents: POD, CMR, delivery notes. Uploaded by users here, by the haulier through
// the transport-order link (publicOrder.service). A POD uploaded by a user does not stamp "POD
// received" by itself: the page offers the stamp.

export const documentItem = (d: TruckingDocumentRecord): TruckingDocumentItem => ({
  id: d.id,
  kind: d.kind,
  fileName: d.fileName,
  uploadedAt: d.createdAt.toISOString(),
  uploadedBy: d.uploadedBy,
  source: d.source,
});

/** Stores the bytes, then (in the caller's transaction) the row and its event. */
export async function storeFile(companyId: string, consignmentId: string, file: CheckedFile): Promise<string> {
  const storageKey = `${companyId}/${consignmentId}/${randomUUID()}`;
  await truckingDocumentBucket.upload(storageKey, file.bytes, { contentType: file.contentType });
  return storageKey;
}

export async function insertDocument(
  tx: Tx,
  companyId: string,
  consignmentId: string,
  file: CheckedFile,
  storageKey: string,
  who: { kind: TruckingDocumentItem["kind"]; source: "USER" | "HAULIER"; userId: string | null; name: string },
): Promise<TruckingDocumentRecord> {
  const row = await truckingDocumentRepository.insert(tx, {
    companyId,
    consignmentId,
    kind: who.kind,
    fileName: file.fileName,
    contentType: file.contentType,
    sizeBytes: file.bytes.length,
    sha256: file.sha256,
    storageKey,
    source: who.source,
    uploadedByUserId: who.userId,
    uploadedBy: who.name,
  });
  await appendEvent(tx, companyId, {
    kind: "document_uploaded",
    consignmentId,
    byUserId: who.userId,
    byName: who.name,
    payload: {
      changes: {},
      summary: `${who.kind === "DELIVERY_NOTE" ? "Delivery note" : who.kind === "OTHER" ? "Document" : who.kind} uploaded${who.source === "HAULIER" ? " by the haulier" : ""}: ${file.fileName}`,
      facts: { documentId: row.id, kind: who.kind, source: who.source, sha256: file.sha256 },
    },
  });
  return row;
}

class TruckingDocumentService {
  async list(actor: Actor, consignmentId: string): Promise<TruckingDocumentItem[]> {
    const { c } = await consignmentService.load(actor.companyID, consignmentId);
    return (await truckingDocumentRepository.list(actor.companyID, c.id)).map(documentItem);
  }

  /** Any user: 10 MB, the type from the bytes; a POD must be a photo or a PDF. */
  async upload(actor: Actor, consignmentId: string, input: { kind: unknown; fileName: unknown; fileBase64: unknown }): Promise<TruckingDocumentItem> {
    const { c } = await consignmentService.load(actor.companyID, consignmentId);
    const kind = documentKind(input.kind);
    const file = checkUpload(input.fileName, input.fileBase64, kind === "POD");
    const name = await userName(actor.userID);
    const key = await storeFile(actor.companyID, c.id, file);
    const row = await inTx((tx) => insertDocument(tx, actor.companyID, c.id, file, key, { kind, source: "USER", userId: actor.userID || null, name }));
    return documentItem(row);
  }

  /** The file; served as a download unless its bytes are an image or a PDF. */
  async content(actor: Actor, documentId: string): Promise<FileDownload> {
    const d = isUuid(documentId) ? await truckingDocumentRepository.find(actor.companyID, documentId) : null;
    if (!d) throw APIError.notFound("Document not found");
    const bytes = await truckingDocumentBucket.download(d.storageKey);
    return { fileName: d.fileName, fileBase64: bytes.toString("base64"), contentType: servedFileType(d.contentType) };
  }
}

export const truckingDocumentService = new TruckingDocumentService();
