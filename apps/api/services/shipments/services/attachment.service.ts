import { randomUUID } from "node:crypto";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { attachmentBucket } from "../storage/attachmentBucket";

class AttachmentService {
  async list(shipmentId: string) {
    return shipmentAttachmentRepository.listByShipmentId(shipmentId);
  }

  async create(shipmentId: string, fileName: string, fileSize: number, fileType: string, contentBase64: string) {
    let storageKey = "";
    if (contentBase64) {
      const buffer = Buffer.from(contentBase64, "base64");
      storageKey = `${shipmentId}/${randomUUID()}`;
      await attachmentBucket.upload(storageKey, buffer, {
        contentType: fileType || "application/octet-stream",
      });
    }
    return shipmentAttachmentRepository.create({ shipmentId, fileName, fileSize, fileType, storageKey });
  }

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

  async delete(id: string) {
    const row = await shipmentAttachmentRepository.getById(id);
    if (row?.storageKey) {
      try {
        await attachmentBucket.remove(row.storageKey);
      } catch {
        /* bucket object already gone — proceed with metadata delete */
      }
    }
    return shipmentAttachmentRepository.delete(id);
  }
}

export const attachmentService = new AttachmentService();
