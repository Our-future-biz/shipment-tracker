import { randomUUID } from "node:crypto";
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { masterJobDocumentRepository } from "../repositories/masterJobDocument.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import type { MasterJobDocumentRecord } from "../schemas/masterJobDocument.schema";
import { masterJobDocumentBucket } from "../storage/masterJobDocumentBucket";
import { canManageDocuments } from "../lib/documentRules";
import { userEmails } from "../lib/userEmails";
import { companyOfMasterJobDocumentToken, masterJobDocumentContentUrl } from "../lib/contentToken";
import { iso } from "../../../lib/db/serialize";
import { isUuid } from "../../../lib/uuid";
import type { FileContent } from "../../../lib/fileContent";
import type { MasterJobDocumentItem } from "../interfaces/interfaces";

// A master job's Documents tab: its own files, kept apart from the shipments' documents (their own
// table and bucket), so linking or unlinking a house never moves one. The rules are the shipments'
// (owner decision, 6 Nov 2026): anyone in the company adds a document, only a manager, an admin or a
// superadmin deletes one.

/** A document as the API shows it: who added it by e-mail, a download link, no storage key. */
function toItem(row: MasterJobDocumentRecord, emails: Map<string, string>): MasterJobDocumentItem {
  return {
    id: row.id,
    masterJobId: row.masterJobId,
    fileName: row.fileName,
    fileSize: row.fileSize,
    fileType: row.fileType,
    contentUrl: masterJobDocumentContentUrl(row.masterJobId, row.id, row.companyId),
    createdAt: iso(row.createdAt),
    documentType: row.documentType,
    uploadedByName: row.uploadedById ? emails.get(row.uploadedById) || "Unknown" : "Unknown",
  };
}

export interface NewMasterJobDocument {
  fileName: string;
  fileType: string;
  contentBase64: string;
  documentType: string;
}

const NOT_FOUND = "Document not found";

class MasterJobDocumentService {
  async list(masterJobId: string, companyId: string): Promise<MasterJobDocumentItem[]> {
    await this.requireMasterJob(masterJobId, companyId);
    const [rows, emails] = await Promise.all([
      masterJobDocumentRepository.listByMasterJobId(masterJobId, companyId),
      userEmails(),
    ]);
    return rows.map((r) => toItem(r, emails));
  }

  /** Stores the bytes, then the record; when the record can't be written, the stored bytes go again. */
  async create(masterJobId: string, companyId: string, file: NewMasterJobDocument, uploadedById: string): Promise<MasterJobDocumentItem> {
    await this.requireMasterJob(masterJobId, companyId);
    // Every document comes with its file and its type, so nothing in the list is unfiled.
    const bytes = Buffer.from(file.contentBase64, "base64");
    if (bytes.length === 0) throw APIError.invalidArgument("The file is empty");
    const documentType = file.documentType.trim();
    if (!documentType) throw APIError.invalidArgument("Choose the document type");
    const storageKey = `${masterJobId}/${randomUUID()}`;
    await masterJobDocumentBucket.upload(storageKey, bytes, { contentType: file.fileType || "application/octet-stream" });
    try {
      const row = await masterJobDocumentRepository.createForCompany(companyId, {
        masterJobId,
        fileName: file.fileName,
        // The size of what was stored, not what the browser said.
        fileSize: bytes.length,
        fileType: file.fileType,
        storageKey,
        documentType,
        uploadedById,
      });
      return toItem(row, await userEmails());
    } catch (err) {
      await masterJobDocumentBucket
        .remove(storageKey)
        .catch((removeErr: unknown) => log.warn(removeErr, "a master job document's bytes were left after a failed save", { storageKey }));
      throw err;
    }
  }

  /**
   * The bytes of a document for the public content endpoint. Served only with a valid token for
   * this document, and only from the company and master job the token and the path name.
   */
  async getContent(masterJobId: string, id: string, token: string | null): Promise<FileContent | null> {
    const companyId = companyOfMasterJobDocumentToken(token, id);
    if (!companyId || !isUuid(masterJobId) || !isUuid(id)) return null;
    const row = await masterJobDocumentRepository.getForMasterJob(id, masterJobId, companyId);
    if (!row?.storageKey) return null;
    try {
      const buffer = await masterJobDocumentBucket.download(row.storageKey);
      return { fileName: row.fileName, fileType: row.fileType, buffer };
    } catch (err) {
      log.warn(err, "master job document file missing from storage", { documentId: id });
      return null;
    }
  }

  /**
   * Only a manager, an admin or a superadmin deletes a document. The record goes first, so the list
   * never shows a document whose file is gone; the stored bytes follow (a failure there is only logged).
   */
  async delete(masterJobId: string, id: string, companyId: string, role: string): Promise<void> {
    if (!canManageDocuments(role)) throw APIError.permissionDenied("Only a manager can delete a document");
    if (!isUuid(masterJobId) || !isUuid(id)) throw APIError.notFound(NOT_FOUND);
    const row = await masterJobDocumentRepository.getForMasterJob(id, masterJobId, companyId);
    if (!row) throw APIError.notFound(NOT_FOUND);
    await masterJobDocumentRepository.softDeleteForCompany(id, companyId);
    if (row.storageKey) {
      await masterJobDocumentBucket
        .remove(row.storageKey)
        .catch((err: unknown) => log.warn(err, "master job document file could not be removed from storage", { documentId: id }));
    }
  }

  // The master job, in the caller's company. An id that is not one is not found either (it never reaches SQL).
  private async requireMasterJob(masterJobId: string, companyId: string): Promise<void> {
    if (!isUuid(masterJobId) || !(await masterJobRepository.getByIdForCompany(masterJobId, companyId))) {
      throw APIError.notFound("Master job not found");
    }
  }
}

export const masterJobDocumentService = new MasterJobDocumentService();
