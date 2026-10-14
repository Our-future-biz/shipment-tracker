import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { quoteAttachmentTable, type QuoteAttachmentRecord } from "../schemas/quoteAttachment.schema";

class QuoteAttachmentRepository extends TenantRepository<typeof quoteAttachmentTable> {
  constructor() {
    super(db, quoteAttachmentTable, "quote_attachment");
  }

  async listByQuoteNumber(quoteNumber: string, companyId: string): Promise<QuoteAttachmentRecord[]> {
    return this.db
      .select()
      .from(quoteAttachmentTable)
      .where(and(
        eq(quoteAttachmentTable.companyId, companyId),
        eq(quoteAttachmentTable.quoteNumber, quoteNumber),
        isNull(quoteAttachmentTable.deletedAt),
      ))
      .orderBy(asc(quoteAttachmentTable.createdAt));
  }

  /** Soft-deletes every attachment of a quote; returns their storage keys. */
  async softDeleteByQuoteNumber(quoteNumber: string, companyId: string): Promise<string[]> {
    const rows = await this.db
      .update(quoteAttachmentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(quoteAttachmentTable.companyId, companyId),
        eq(quoteAttachmentTable.quoteNumber, quoteNumber),
        isNull(quoteAttachmentTable.deletedAt),
      ))
      .returning({ storageKey: quoteAttachmentTable.storageKey });
    return rows.map((r) => r.storageKey).filter(Boolean);
  }
}

export const quoteAttachmentRepository = new QuoteAttachmentRepository();
