import { and, eq, isNull, like } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { quoteTable } from "../schemas/quote.schema";

class QuoteRepository extends TenantRepository<typeof quoteTable> {
  constructor() {
    super(db as never, quoteTable, "quote");
  }

  async findByQuoteNumber(quoteNumber: string, companyId: string) {
    return this.getByColumnForCompany(quoteTable.quoteNumber, quoteNumber, companyId);
  }

  async findNumbersByPrefix(prefix: string, companyId: string): Promise<string[]> {
    // Include soft-deleted quotes: a reference must never be reused, so the next
    // sequence number is computed over every quote ever created under this prefix
    // within this company.
    const rows = await this.db
      .select({ quoteNumber: quoteTable.quoteNumber })
      .from(quoteTable)
      .where(and(eq(quoteTable.companyId, companyId), like(quoteTable.quoteNumber, `${prefix}%`)));
    return rows.map((r) => r.quoteNumber);
  }

  async updateData(quoteNumber: string, companyId: string, data: unknown) {
    const [row] = await this.db
      .update(quoteTable)
      .set({ data, updatedAt: new Date() } as never)
      .where(and(eq(quoteTable.companyId, companyId), eq(quoteTable.quoteNumber, quoteNumber), isNull(quoteTable.deletedAt)))
      .returning();
    return row ?? null;
  }
}

export const quoteRepository = new QuoteRepository();
