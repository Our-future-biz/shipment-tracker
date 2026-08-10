import { randomUUID } from "node:crypto";
import { quoteAttachmentRepository } from "../repositories/quoteAttachment.repository";
import { quoteAttachmentBucket } from "../storage/quoteAttachmentBucket";

class QuoteAttachmentService {
  async list(quoteNumber: string, companyId: string) {
    return quoteAttachmentRepository.listByQuoteNumber(quoteNumber, companyId);
  }

  async create(quoteNumber: string, companyId: string, fileName: string, fileSize: number, fileType: string, contentBase64: string) {
    let storageKey = "";
    if (contentBase64) {
      const buffer = Buffer.from(contentBase64, "base64");
      storageKey = `${quoteNumber}/${randomUUID()}`;
      await quoteAttachmentBucket.upload(storageKey, buffer, {
        contentType: fileType || "application/octet-stream",
      });
    }
    return quoteAttachmentRepository.create({ companyId, quoteNumber, fileName, fileSize, fileType, storageKey });
  }

  // Public path (no token): relies on the caller checking quoteNumber matches the URL.
  async getContent(
    id: string,
  ): Promise<{ quoteNumber: string; fileName: string; fileType: string; buffer: Buffer } | null> {
    const row = await quoteAttachmentRepository.getById(id);
    if (!row || !row.storageKey) return null;
    try {
      const buffer = await quoteAttachmentBucket.download(row.storageKey);
      return { quoteNumber: row.quoteNumber, fileName: row.fileName, fileType: row.fileType, buffer };
    } catch {
      return null;
    }
  }

  async delete(id: string, companyId: string) {
    const row = await quoteAttachmentRepository.getByIdForCompany(id, companyId);
    if (row?.storageKey) {
      try {
        await quoteAttachmentBucket.remove(row.storageKey);
      } catch {
        /* bucket object already gone — proceed with metadata delete */
      }
    }
    return quoteAttachmentRepository.delete(id, companyId);
  }
}

export const quoteAttachmentService = new QuoteAttachmentService();
