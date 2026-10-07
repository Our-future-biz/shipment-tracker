import { randomUUID } from "node:crypto";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { attachmentBucket } from "../storage/attachmentBucket";
import { userNames } from "./userNames";

/** An attachment row plus the display names its user ids resolve to. */
type AttachmentRow = Awaited<ReturnType<typeof shipmentAttachmentRepository.getById>>;

class AttachmentService {
  private withNames<T extends NonNullable<AttachmentRow>>(row: T, names: Map<string, string>) {
    return {
      ...row,
      uploadedByName: row.uploadedById ? names.get(row.uploadedById) || "Unknown" : "Unknown",
      customsReviewedByName: row.customsReviewedById
        ? names.get(row.customsReviewedById) || "Unknown"
        : "",
    };
  }

  async list(shipmentId: string, companyId: string) {
    const [rows, names] = await Promise.all([
      shipmentAttachmentRepository.listByShipmentId(shipmentId, companyId),
      userNames(),
    ]);
    return rows.map((r) => this.withNames(r, names));
  }

  async create(
    shipmentId: string,
    companyId: string,
    fileName: string,
    fileSize: number,
    fileType: string,
    contentBase64: string,
    documentType = "",
    uploadedById?: string,
  ) {
    let storageKey = "";
    if (contentBase64) {
      const buffer = Buffer.from(contentBase64, "base64");
      storageKey = `${shipmentId}/${randomUUID()}`;
      await attachmentBucket.upload(storageKey, buffer, {
        contentType: fileType || "application/octet-stream",
      });
    }
    const row = await shipmentAttachmentRepository.create({
      companyId, shipmentId, fileName, fileSize, fileType, storageKey, documentType,
      uploadedById: uploadedById ?? null,
    });
    return this.withNames(row, await userNames());
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
    const row = await shipmentAttachmentRepository.update(id, companyId, { documentType });
    return row ? this.withNames(row, await userNames()) : null;
  }

  /**
   * Customs review. status "" clears the review back to pending; "declined"
   * keeps the reason so operations can see what to fix.
   */
  async review(id: string, companyId: string, status: string, note: string, userId: string) {
    const clear = status !== "approved" && status !== "declined";
    const row = await shipmentAttachmentRepository.update(id, companyId, {
      customsStatus: clear ? "" : status,
      customsNote: status === "declined" ? note : "",
      customsReviewedAt: clear ? null : new Date(),
      customsReviewedById: clear ? null : userId,
    });
    return row ? this.withNames(row, await userNames()) : null;
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
