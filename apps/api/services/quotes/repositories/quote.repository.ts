import { eq, like } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { quoteTable } from "../schemas/quote.schema";

class QuoteRepository extends BaseRepository<typeof quoteTable> {
  constructor() {
    super(db as never, quoteTable, "quote");
  }

  async findByQuoteNumber(quoteNumber: string) {
    return this.getByColumn(quoteTable.quoteNumber, quoteNumber);
  }

  async findNumbersByPrefix(prefix: string): Promise<string[]> {
    // Include soft-deleted quotes: a reference must never be reused, so the next
    // sequence number is computed over every quote ever created under this prefix.
    const rows = await this.db
      .select({ quoteNumber: quoteTable.quoteNumber })
      .from(quoteTable)
      .where(like(quoteTable.quoteNumber, `${prefix}%`));
    return rows.map((r) => r.quoteNumber);
  }

  async updateData(quoteNumber: string, data: unknown) {
    const [row] = await this.db
      .update(quoteTable)
      .set({ data, updatedAt: new Date() } as never)
      .where(eq(quoteTable.quoteNumber, quoteNumber))
      .returning();
    return row ?? null;
  }
}

export const quoteRepository = new QuoteRepository();
