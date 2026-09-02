import { randomUUID } from "node:crypto";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { attachmentBucket } from "../storage/attachmentBucket";

class AttachmentService {
  async list(shipmentId: string, companyId: string) {
    return shipmentAttachmentRepository.listByShipmentId(shipmentId, companyId);
  }

  async create(shipmentId: string, companyId: string, fileName: string, fileSize: number, fileType: string, contentBase64: string, documentType = "") {
    let storageKey = "";
    if (contentBase64) {
      const buffer = Buffer.from(contentBase64, "base64");
      storageKey = `${shipmentId}/${randomUUID()}`;
      await attachmentBucket.upload(storageKey, buffer, {
        contentType: fileType || "application/octet-stream",
      });
    }
    return shipmentAttachmentRepository.create({ companyId, shipmentId, fileName, fileSize, fileType, storageKey, documentType });
  }

  // Public path (no token): relies on the caller checking shipmentId matches the URL.
  async getContent(
    id: string,
  ): Promise<{ shipmentId: string; fileName: string; fileType: string; buffer: Buffer } | null> {
    const row = await shipmentAttachmentRepository.getById(id);
    if (!row || !row.storageKey) return null;
    try {
      const buffer = await attachmentBucket.download(row.storageKey);
      return { shipmentId: row.shipmentId, fileName: row.fileName, fileType: row.fileType, buffer };
    } catch {
      return null;
    }
  }

  /** Set the business document type (Invoice, Packing list, …). */
  async classify(id: string, companyId: string, documentType: string) {
    return shipmentAttachmentRepository.update(id, companyId, { documentType });
  }

  /**
   * Customs review. status "" clears the review back to pending; "declined"
   * keeps the reason so operations can see what to fix.
   */
  async review(id: string, companyId: string, status: string, note: string, userId: string) {
    const clear = status !== "approved" && status !== "declined";
    return shipmentAttachmentRepository.update(id, companyId, {
      customsStatus: clear ? "" : status,
      customsNote: status === "declined" ? note : "",
      customsReviewedAt: clear ? null : new Date(),
      customsReviewedById: clear ? null : userId,
    });
  }

  async delete(id: string, companyId: string) {
    const row = await shipmentAttachmentRepository.getByIdForCompany(id, companyId);
    if (row?.storageKey) {
      try {
        await attachmentBucket.remove(row.storageKey);
      } catch {
        /* bucket object already gone — proceed with metadata delete */
      }
    }
    return shipmentAttachmentRepository.delete(id, companyId);
  }
}

export const attachmentService = new AttachmentService();
