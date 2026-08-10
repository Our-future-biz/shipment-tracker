import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/db";
import { quoteAttachmentTable } from "../schemas/quoteAttachment.schema";

class QuoteAttachmentRepository {
  async listByQuoteNumber(quoteNumber: string, companyId: string) {
    return db
      .select()
      .from(quoteAttachmentTable)
      .where(and(
        eq(quoteAttachmentTable.companyId, companyId),
        eq(quoteAttachmentTable.quoteNumber, quoteNumber),
        isNull(quoteAttachmentTable.deletedAt),
      ))
      .orderBy(asc(quoteAttachmentTable.createdAt));
  }

  // Company-agnostic lookup for the PUBLIC raw content endpoint (bare-URL download, no
  // token). The caller must still verify the attachment's quoteNumber matches the URL.
  async getById(id: string) {
    const [row] = await db
      .select()
      .from(quoteAttachmentTable)
      .where(and(eq(quoteAttachmentTable.id, id), isNull(quoteAttachmentTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async getByIdForCompany(id: string, companyId: string) {
    const [row] = await db
      .select()
      .from(quoteAttachmentTable)
      .where(and(eq(quoteAttachmentTable.id, id), eq(quoteAttachmentTable.companyId, companyId), isNull(quoteAttachmentTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async create(data: { companyId: string; quoteNumber: string; fileName: string; fileSize: number; fileType: string; storageKey: string }) {
    const [row] = await db.insert(quoteAttachmentTable).values(data).returning();
    return row!;
  }

  async delete(id: string, companyId: string) {
    await db
      .update(quoteAttachmentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(quoteAttachmentTable.id, id), eq(quoteAttachmentTable.companyId, companyId), isNull(quoteAttachmentTable.deletedAt)));
  }
}

export const quoteAttachmentRepository = new QuoteAttachmentRepository();
