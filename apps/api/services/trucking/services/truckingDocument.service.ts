import { randomUUID } from "node:crypto";
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { inTx } from "../db/db";
import { truckingDocumentRepository } from "../repositories/truckingDocument.repository";
import { appendEvent } from "../repositories/event.repository";
import { truckingDocumentBucket } from "../storage/documentBucket";
import type { TruckingDocumentRecord } from "../schemas/truckingConsignment.schema";
import type { FileDownload, TruckingDocumentItem } from "../interfaces/interfaces";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import { servedFileType } from "../../../lib/fileType";
import { checkUpload, documentKind, type CheckedFile } from "../lib/truckingFiles";
import { userName } from "../lib/users";
import { requireManager } from "../lib/roles";
import { cleanReason } from "../lib/consignmentRules";
import { consignmentService } from "./consignment.service";
import type { Tx } from "../db/db";

// Consignment documents: POD, CMR, delivery notes. Uploaded by users here, by the haulier through
// the transport-order link (publicOrder.service) or the portal. A POD uploaded by a user does not
// stamp "POD received" by itself: the page offers the stamp. One POD per consignment (stop): a
// second is refused everywhere, a manager replaces it here with a reason (owner decision 13). The
// bytes are stored only once a save's checks passed, and removed again when its transaction fails.

/** A second POD from the haulier (link or portal). */
export const POD_ON_FILE_HAULIER = "A POD for this stop is already uploaded. If it must be replaced, please call the dispatcher.";
/** A second POD from a user. */
export const POD_ON_FILE = "This consignment already has a POD. A manager can replace it (Replace POD, with the reason).";

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

/**
 * Stores the bytes, then runs `work` with their key (the caller's transaction); when it fails the
 * bytes are removed again (best effort: a leftover is only logged), so a refused save leaves no file.
 */
export async function withStoredFile<T>(companyId: string, consignmentId: string, file: CheckedFile, work: (key: string) => Promise<T>): Promise<T> {
  const key = await storeFile(companyId, consignmentId, file);
  try {
    return await work(key);
  } catch (err) {
    await truckingDocumentBucket.remove(key).catch((e: unknown) => log.warn(e, "trucking: the file of a failed save was not removed", { key }));
    throw err;
  }
}

/** In the caller's transaction: the consignment's POD locked and refused when one is already on file. */
export async function assertNoPod(tx: Tx, companyId: string, consignmentId: string, refusal: string): Promise<void> {
  await truckingDocumentRepository.lockPod(tx, companyId, consignmentId);
  if (await truckingDocumentRepository.hasPod(companyId, consignmentId, tx)) throw APIError.failedPrecondition(refusal);
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

  /** Any user: 10 MB, the type from the bytes; a POD must be a photo or a PDF, one per consignment (a manager replaces it). */
  async upload(actor: Actor, consignmentId: string, input: { kind: unknown; fileName: unknown; fileBase64: unknown }): Promise<TruckingDocumentItem> {
    const companyId = actor.companyID;
    const { c } = await consignmentService.load(companyId, consignmentId);
    const kind = documentKind(input.kind);
    const file = checkUpload(input.fileName, input.fileBase64, kind === "POD");
    if (kind === "POD" && (await truckingDocumentRepository.hasPod(companyId, c.id))) throw APIError.failedPrecondition(POD_ON_FILE);
    const name = await userName(actor.userID);
    const row = await withStoredFile(companyId, c.id, file, (key) =>
      inTx(async (tx) => {
        if (kind === "POD") await assertNoPod(tx, companyId, c.id, POD_ON_FILE);
        return insertDocument(tx, companyId, c.id, file, key, { kind, source: "USER", userId: actor.userID || null, name });
      }),
    );
    return documentItem(row);
  }

  /**
   * Manager, with a reason: a consignment's POD replaced by a new file (a photo or a PDF). The old
   * one leaves the list (kept in storage and named in the event); the stamps stay as they are.
   */
  async replacePod(actor: Actor, documentId: string, input: { fileName: unknown; fileBase64: unknown; reason: unknown }): Promise<TruckingDocumentItem> {
    requireManager(actor.role, "replace a POD");
    const companyId = actor.companyID;
    const old = isUuid(documentId) ? await truckingDocumentRepository.find(companyId, documentId) : null;
    if (!old) throw APIError.notFound("Document not found");
    if (old.kind !== "POD") throw APIError.failedPrecondition("Only a POD is replaced: upload other documents as new ones");
    const reason = cleanReason(input.reason, "the reason for replacing the POD");
    const file = checkUpload(input.fileName, input.fileBase64, true);
    const name = await userName(actor.userID);
    const row = await withStoredFile(companyId, old.consignmentId, file, (key) =>
      inTx(async (tx) => {
        await truckingDocumentRepository.lockPod(tx, companyId, old.consignmentId);
        if (!(await truckingDocumentRepository.retire(tx, companyId, old.id))) throw APIError.aborted("The POD was changed by someone else. Reload and try again.");
        const row = await truckingDocumentRepository.insert(tx, {
          companyId,
          consignmentId: old.consignmentId,
          kind: "POD",
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.bytes.length,
          sha256: file.sha256,
          storageKey: key,
          source: "USER",
          uploadedByUserId: actor.userID || null,
          uploadedBy: name,
        });
        await appendEvent(tx, companyId, {
          kind: "document_replaced",
          consignmentId: old.consignmentId,
          byUserId: actor.userID || null,
          byName: name,
          payload: {
            changes: { pod: { before: old.fileName, after: file.fileName } },
            reason,
            summary: `POD replaced by a manager: ${old.fileName} → ${file.fileName}`,
            facts: { documentId: row.id, replacedDocumentId: old.id, kind: "POD", source: "USER", sha256: file.sha256 },
          },
        });
        return row;
      }),
    );
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
