import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { quoteGuardrailTable as t, type QuoteGuardrailRecord } from "../schemas/quoteGuardrail.schema";

// The margin floors a company's sales managers set, one row per freight mode (Sales Settings →
// Guardrails). A mode without a row has the default floor (lib/guardrails).
class QuoteGuardrailRepository {
  async list(companyId: string): Promise<QuoteGuardrailRecord[]> {
    return db.select().from(t).where(and(eq(t.companyId, companyId), isNull(t.deletedAt)));
  }

  /** Stores the floors given, each mode's row written over (one transaction). */
  async save(companyId: string, rows: { serviceType: string; percent: number; minAmountCzk: number }[], userId: string): Promise<void> {
    if (!rows.length) return;
    await db.transaction(async (tx) => {
      for (const r of rows) {
        await tx
          .insert(t)
          .values({ companyId, serviceType: r.serviceType, percent: r.percent, minAmountCzk: r.minAmountCzk, updatedBy: userId })
          .onConflictDoUpdate({
            target: [t.companyId, t.serviceType],
            targetWhere: sql`deleted_at IS NULL`,
            set: { percent: r.percent, minAmountCzk: r.minAmountCzk, updatedBy: userId, updatedAt: new Date() },
          });
      }
    });
  }
}

export const quoteGuardrailRepository = new QuoteGuardrailRepository();
