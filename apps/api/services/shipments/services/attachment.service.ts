import { randomUUID } from "node:crypto";
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import type { ShipmentAttachmentRecord } from "../schemas/shipmentAttachment.schema";
import { attachmentBucket } from "../storage/attachmentBucket";
import { APPROVED_DOCUMENT_REFUSAL, canManageDocuments, documentReviewRefusal } from "../lib/documentRules";
import { userEmails } from "../lib/userEmails";
import { attachmentContentUrl, companyOfContentToken } from "../lib/contentToken";
import { iso, isoOrNull } from "../../../lib/db/serialize";
import type { FileContent } from "../../../lib/fileContent";
import type { AttachmentCustomsStatus, AttachmentItem } from "../interfaces/interfaces";
import { shipmentService } from "./shipment.service";

/** An attachment row as the API shows it: who uploaded and reviewed it by e-mail, a download link, no storage key. */
function toItem(row: ShipmentAttachmentRecord, emails: Map<string, string>): AttachmentItem {
  return {
    id: row.id,
    shipmentId: row.shipmentId,
    fileName: row.fileName,
    fileSize: row.fileSize,
    fileType: row.fileType,
    contentUrl: attachmentContentUrl(row.shipmentId, row.id, row.companyId),
    createdAt: iso(row.createdAt),
    documentType: row.documentType,
    customsStatus: row.customsStatus,
    customsNote: row.customsNote,
    customsReviewedAt: isoOrNull(row.customsReviewedAt),
    uploadedByName: row.uploadedById ? emails.get(row.uploadedById) || "Unknown" : "Unknown",
    customsReviewedByName: row.customsReviewedById ? emails.get(row.customsReviewedById) || "Unknown" : "",
  };
}

export interface NewAttachment {
  fileName: string;
  fileSize: number;
  fileType: string;
  contentBase64: string;
  documentType: string;
}

class AttachmentService {
  async list(shipmentId: string, companyId: string): Promise<AttachmentItem[]> {
    await shipmentService.requireLive(shipmentId, companyId);
    const [rows, emails] = await Promise.all([
      shipmentAttachmentRepository.listByShipmentId(shipmentId, companyId),
      userEmails(),
    ]);
    return rows.map((r) => toItem(r, emails));
  }

  async create(shipmentId: string, companyId: string, file: NewAttachment, uploadedById: string): Promise<AttachmentItem> {
    await shipmentService.requireLive(shipmentId, companyId);
    let storageKey = "";
    if (file.contentBase64) {
      storageKey = `${shipmentId}/${randomUUID()}`;
      await attachmentBucket.upload(storageKey, Buffer.from(file.contentBase64, "base64"), {
        contentType: file.fileType || "application/octet-stream",
      });
    }
    const row = await shipmentAttachmentRepository.createForCompany(companyId, {
      shipmentId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      fileType: file.fileType,
      storageKey,
      documentType: file.documentType,
      uploadedById,
    });
    return toItem(row, await userEmails());
  }

  /**
   * A file another module hands over, once per `sourceRef`: a retry finds the first copy. The bytes
   * are stored first and removed again when another delivery got there meanwhile.
   */
  async addFromModule(
    shipmentId: string,
    companyId: string,
    file: { fileName: string; fileType: string; contentBase64: string; documentType: string; sourceRef: string },
    uploadedById: string,
  ): Promise<{ created: boolean }> {
    await shipmentService.requireLive(shipmentId, companyId);
    if (await shipmentAttachmentRepository.findBySourceRef(shipmentId, companyId, file.sourceRef)) return { created: false };
    const bytes = Buffer.from(file.contentBase64, "base64");
    const storageKey = `${shipmentId}/${randomUUID()}`;
    await attachmentBucket.upload(storageKey, bytes, { contentType: file.fileType || "application/octet-stream" });
    const created = await shipmentAttachmentRepository.addOnce({
      companyId,
      shipmentId,
      fileName: file.fileName,
      fileSize: bytes.length,
      fileType: file.fileType,
      storageKey,
      documentType: file.documentType,
      uploadedById,
      sourceRef: file.sourceRef,
    });
    if (!created) await attachmentBucket.remove(storageKey).catch((err: unknown) => log.warn(err, "a duplicate handed-over file was not removed", { storageKey }));
    return { created };
  }

  /**
   * The bytes of a file for the public content endpoint. Served only with a valid token for
   * this file, and only from the company and shipment the token and the path name.
   */
  async getContent(shipmentId: string, id: string, token: string | null): Promise<FileContent | null> {
    const companyId = companyOfContentToken(token, id);
    if (!companyId) return null;
    const row = await shipmentAttachmentRepository.getForShipment(id, shipmentId, companyId);
    if (!row?.storageKey) return null;
    try {
      const buffer = await attachmentBucket.download(row.storageKey);
      return { fileName: row.fileName, fileType: row.fileType, buffer };
    } catch (err) {
      log.warn(err, "attachment file missing from storage", { attachmentId: id });
      return null;
    }
  }

  /**
   * Set the business document type (Invoice, Packing list, …). A regular user (`role` given) can't
   * re-type an approved document: customs approved it as that type, and the shipment's paperwork
   * status reads the approvals per type.
   */
  async classify(shipmentId: string, id: string, companyId: string, documentType: string, role?: string): Promise<AttachmentItem> {
    const guarded = role !== undefined && !canManageDocuments(role);
    const row = await shipmentAttachmentRepository.updateReview(id, shipmentId, companyId, { documentType }, { unlessApproved: guarded });
    if (!row) {
      const current = guarded ? await shipmentAttachmentRepository.getForShipment(id, shipmentId, companyId) : null;
      if (current?.customsStatus === "approved") throw APIError.permissionDenied(APPROVED_DOCUMENT_REFUSAL);
      throw APIError.notFound("Attachment not found");
    }
    return toItem(row, await userEmails());
  }

  /**
   * Customs review. status "" clears the review back to pending; "declined"
   * keeps the reason so operations can see what to fix.
   */
  async review(
    shipmentId: string,
    id: string,
    companyId: string,
    status: AttachmentCustomsStatus,
    note: string,
    userId: string,
    role?: string,
  ): Promise<AttachmentItem> {
    // A regular user leaves an approved document as it is: no undoing it, and approving it again
    // would only put their name and a new time on customs' approval (and a new note in the bell).
    const guarded = role !== undefined && !canManageDocuments(role);
    if (guarded) {
      const current = await shipmentAttachmentRepository.getForShipment(id, shipmentId, companyId);
      if (!current) throw APIError.notFound("Attachment not found");
      const refusal = documentReviewRefusal(current.customsStatus, status, role);
      if (refusal) throw APIError.permissionDenied(refusal);
      if (current.customsStatus === "approved") return toItem(current, await userEmails());
    }
    const clear = status === "";
    const row = await shipmentAttachmentRepository.updateReview(
      id,
      shipmentId,
      companyId,
      {
        customsStatus: status,
        customsNote: status === "declined" ? note : "",
        customsReviewedAt: clear ? null : new Date(),
        customsReviewedById: clear ? null : userId,
      },
      { unlessApproved: guarded },
    );
    // Approved by someone else between the read and the write.
    if (!row && guarded) throw APIError.permissionDenied(APPROVED_DOCUMENT_REFUSAL);
    if (!row) throw APIError.notFound("Attachment not found");
    return toItem(row, await userEmails());
  }

  async delete(shipmentId: string, id: string, companyId: string): Promise<void> {
    const row = await shipmentAttachmentRepository.getForShipment(id, shipmentId, companyId);
    if (!row) throw APIError.notFound("Attachment not found");
    if (row.storageKey) {
      try {
        await attachmentBucket.remove(row.storageKey);
      } catch (err) {
        // The stored object may already be gone; the record is removed either way.
        log.warn(err, "attachment file could not be removed from storage", { attachmentId: id });
      }
    }
    await shipmentAttachmentRepository.softDeleteForCompany(id, companyId);
  }
}

export const attachmentService = new AttachmentService();
