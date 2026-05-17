import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { quoteRefSequenceTable } from "../schemas/quoteRefSequence.schema";

class QuoteRefSequenceRepository {
  async getNextSubLine(quoteNumber: string): Promise<number> {
    const [existing] = await db
      .select()
      .from(quoteRefSequenceTable)
      .where(eq(quoteRefSequenceTable.quoteNumber, quoteNumber))
      .limit(1);

    if (existing) {
      const next = existing.nextSubLine;
      await db
        .update(quoteRefSequenceTable)
        .set({ nextSubLine: next + 1, updatedAt: new Date() })
        .where(eq(quoteRefSequenceTable.id, existing.id));
      return next;
    }

    await db.insert(quoteRefSequenceTable).values({ quoteNumber, nextSubLine: 2 });
    return 1;
  }
}

export const quoteRefSequenceRepository = new QuoteRefSequenceRepository();
