import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/db";
import { quoteAttachmentTable } from "../schemas/quoteAttachment.schema";

class QuoteAttachmentRepository {
  async listByQuoteNumber(quoteNumber: string) {
    return db
      .select()
      .from(quoteAttachmentTable)
      .where(and(eq(quoteAttachmentTable.quoteNumber, quoteNumber), isNull(quoteAttachmentTable.deletedAt)))
      .orderBy(asc(quoteAttachmentTable.createdAt));
  }

  async getById(id: string) {
    const [row] = await db
      .select()
      .from(quoteAttachmentTable)
      .where(and(eq(quoteAttachmentTable.id, id), isNull(quoteAttachmentTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async create(data: { quoteNumber: string; fileName: string; fileSize: number; fileType: string; storageKey: string }) {
    const [row] = await db.insert(quoteAttachmentTable).values(data).returning();
    return row!;
  }

  async delete(id: string) {
    await db
      .update(quoteAttachmentTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(quoteAttachmentTable.id, id));
  }
}

export const quoteAttachmentRepository = new QuoteAttachmentRepository();
