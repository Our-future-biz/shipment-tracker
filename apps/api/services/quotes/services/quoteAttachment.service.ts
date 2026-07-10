import { randomUUID } from "node:crypto";
import { quoteAttachmentRepository } from "../repositories/quoteAttachment.repository";
import { quoteAttachmentBucket } from "../storage/quoteAttachmentBucket";

class QuoteAttachmentService {
  async list(quoteNumber: string) {
    return quoteAttachmentRepository.listByQuoteNumber(quoteNumber);
  }

  async create(quoteNumber: string, fileName: string, fileSize: number, fileType: string, contentBase64: string) {
    let storageKey = "";
    if (contentBase64) {
      const buffer = Buffer.from(contentBase64, "base64");
      storageKey = `${quoteNumber}/${randomUUID()}`;
      await quoteAttachmentBucket.upload(storageKey, buffer, {
        contentType: fileType || "application/octet-stream",
      });
    }
    return quoteAttachmentRepository.create({ quoteNumber, fileName, fileSize, fileType, storageKey });
  }

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

  async delete(id: string) {
    const row = await quoteAttachmentRepository.getById(id);
    if (row?.storageKey) {
      try {
        await quoteAttachmentBucket.remove(row.storageKey);
      } catch {
        /* bucket object already gone — proceed with metadata delete */
      }
    }
    return quoteAttachmentRepository.delete(id);
  }
}

export const quoteAttachmentService = new QuoteAttachmentService();
