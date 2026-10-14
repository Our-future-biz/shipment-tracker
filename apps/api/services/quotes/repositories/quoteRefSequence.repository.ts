import { sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { quoteRefSequenceTable } from "../schemas/quoteRefSequence.schema";

class QuoteRefSequenceRepository extends TenantRepository<typeof quoteRefSequenceTable> {
  constructor() {
    super(db, quoteRefSequenceTable, "quote_ref_sequence");
  }

  // Takes the next sub-line number in one statement (insert, or bump the existing counter),
  // so two people allocating at once can never get the same number.
  async takeNextSubLine(quoteNumber: string, companyId: string): Promise<number> {
    const [row] = await this.db
      .insert(quoteRefSequenceTable)
      .values({ companyId, quoteNumber, nextSubLine: 2 })
      .onConflictDoUpdate({
        target: [quoteRefSequenceTable.companyId, quoteRefSequenceTable.quoteNumber],
        targetWhere: sql`deleted_at IS NULL`,
        set: { nextSubLine: sql`${quoteRefSequenceTable.nextSubLine} + 1`, updatedAt: new Date() },
      })
      .returning({ next: quoteRefSequenceTable.nextSubLine });
    // The counter holds the number after the one just taken.
    return row!.next - 1;
  }
}

export const quoteRefSequenceRepository = new QuoteRefSequenceRepository();
