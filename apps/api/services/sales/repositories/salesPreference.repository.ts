import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { salesPreferenceTable } from "../schemas/salesPreference.schema";

class SalesPreferenceRepository {
  async get(prefKey: string, companyId: string): Promise<unknown | null> {
    const [row] = await db
      .select()
      .from(salesPreferenceTable)
      .where(and(eq(salesPreferenceTable.companyId, companyId), eq(salesPreferenceTable.prefKey, prefKey), isNull(salesPreferenceTable.deletedAt)))
      .limit(1);
    return row ? row.value : null;
  }

  // One statement: the value is stored as a new row, or over the company's live row of that key
  // (sales_preference_company_key_unique). Looking first and writing after would let two first
  // saves of a key both find nothing, and the second would fail on that index.
  async set(prefKey: string, companyId: string, value: unknown): Promise<void> {
    await db
      .insert(salesPreferenceTable)
      .values({ companyId, prefKey, value } as never)
      .onConflictDoUpdate({
        target: [salesPreferenceTable.companyId, salesPreferenceTable.prefKey],
        // The index holds live rows only; this names it by repeating its condition as it is written.
        targetWhere: sql`deleted_at IS NULL`,
        set: { value, updatedAt: new Date() } as never,
      });
  }
}

export const salesPreferenceRepository = new SalesPreferenceRepository();
