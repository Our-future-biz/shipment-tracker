import { randomUUID } from "node:crypto";
import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import type { ShipmentAttachmentRecord } from "../schemas/shipmentAttachment.schema";
import { attachmentBucket } from "../storage/attachmentBucket";
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

  /** Set the business document type (Invoice, Packing list, …). */
  async classify(shipmentId: string, id: string, companyId: string, documentType: string): Promise<AttachmentItem> {
    const row = await shipmentAttachmentRepository.updateReview(id, shipmentId, companyId, { documentType });
    if (!row) throw APIError.notFound("Attachment not found");
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
  ): Promise<AttachmentItem> {
    const clear = status === "";
    const row = await shipmentAttachmentRepository.updateReview(id, shipmentId, companyId, {
      customsStatus: status,
      customsNote: status === "declined" ? note : "",
      customsReviewedAt: clear ? null : new Date(),
      customsReviewedById: clear ? null : userId,
    });
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
