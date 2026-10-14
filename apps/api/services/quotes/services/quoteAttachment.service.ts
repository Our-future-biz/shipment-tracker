import { randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { iso } from "../../../lib/db/serialize";
import { signContentToken, verifyContentToken } from "../../../lib/signedUrl";
import { quoteAttachmentRepository } from "../repositories/quoteAttachment.repository";
import type { NewQuoteAttachmentRecord, QuoteAttachmentRecord } from "../schemas/quoteAttachment.schema";
import { quoteAttachmentBucket } from "../storage/quoteAttachmentBucket";
import type { QuoteAttachmentItem } from "../interfaces/interfaces";

const jwtSecret = secret("JWT_SECRET");
const TOKEN_KIND = "quote-attachment";

export interface QuoteAttachmentFile {
  fileName: string;
  fileType: string;
  buffer: Buffer;
}

export interface NewQuoteAttachment {
  fileName: string;
  fileSize: number;
  fileType: string;
  contentBase64: string;
}

const contentUrl = (r: QuoteAttachmentRecord): string => {
  const token = signContentToken(jwtSecret(), { kind: TOKEN_KIND, id: r.id, companyId: r.companyId });
  return `/quotes/${encodeURIComponent(r.quoteNumber)}/attachments/${r.id}/content?t=${encodeURIComponent(token)}`;
};

const toItem = (r: QuoteAttachmentRecord): QuoteAttachmentItem => ({
  id: r.id,
  quoteNumber: r.quoteNumber,
  fileName: r.fileName,
  fileSize: r.fileSize,
  fileType: r.fileType,
  createdAt: iso(r.createdAt),
  contentUrl: contentUrl(r),
});

class QuoteAttachmentService {
  async list(quoteNumber: string, companyId: string): Promise<QuoteAttachmentItem[]> {
    return (await quoteAttachmentRepository.listByQuoteNumber(quoteNumber, companyId)).map(toItem);
  }

  async create(quoteNumber: string, companyId: string, file: NewQuoteAttachment): Promise<QuoteAttachmentItem> {
    let storageKey = "";
    if (file.contentBase64) {
      storageKey = `${companyId}/${quoteNumber}/${randomUUID()}`;
      await quoteAttachmentBucket.upload(storageKey, Buffer.from(file.contentBase64, "base64"), {
        contentType: file.fileType || "application/octet-stream",
      });
    }
    const values: Omit<NewQuoteAttachmentRecord, "companyId"> = {
      quoteNumber,
      fileName: file.fileName,
      fileSize: file.fileSize,
      fileType: file.fileType,
      storageKey,
    };
    return toItem(await quoteAttachmentRepository.createForCompany(companyId, values));
  }

  /**
   * The file a signed link points at: the token must be valid, for this attachment, and the
   * attachment must still belong to the quote in the URL. Null otherwise (served as 404).
   */
  async getContent(quoteNumber: string, id: string, token: string | null): Promise<QuoteAttachmentFile | null> {
    const claim = verifyContentToken(jwtSecret(), token, TOKEN_KIND);
    if (!claim || claim.id !== id) return null;
    const row = await quoteAttachmentRepository.getByIdForCompany(id, claim.companyId);
    if (!row || row.quoteNumber !== quoteNumber || !row.storageKey) return null;
    try {
      return { fileName: row.fileName, fileType: row.fileType, buffer: await quoteAttachmentBucket.download(row.storageKey) };
    } catch (err) {
      log.error(err, "quote attachment bytes missing from storage", { id, storageKey: row.storageKey });
      return null;
    }
  }

  async delete(quoteNumber: string, id: string, companyId: string): Promise<void> {
    const row = await quoteAttachmentRepository.getByIdForCompany(id, companyId);
    if (!row || row.quoteNumber !== quoteNumber) throw APIError.notFound("Attachment not found");
    await quoteAttachmentRepository.softDeleteForCompany(id, companyId);
    await this.removeObjects([row.storageKey]);
  }

  async removeAllOfQuote(quoteNumber: string, companyId: string): Promise<void> {
    await this.removeObjects(await quoteAttachmentRepository.softDeleteByQuoteNumber(quoteNumber, companyId));
  }

  // The rows are already gone from every list, so a bucket object that can't be removed is only
  // logged (it becomes an unreferenced object, not a broken attachment).
  private async removeObjects(keys: string[]): Promise<void> {
    for (const key of keys.filter(Boolean)) {
      try {
        await quoteAttachmentBucket.remove(key);
      } catch (err) {
        log.warn("could not remove quote attachment object", { storageKey: key, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
}

export const quoteAttachmentService = new QuoteAttachmentService();
