import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { salesPreferenceTable } from "../schemas/salesPreference.schema";

class SalesPreferenceRepository {
  async get(prefKey: string, companyId: string): Promise<unknown | null> {
    const [row] = await db
      .select()
      .from(salesPreferenceTable)
      .where(and(eq(salesPreferenceTable.companyId, companyId), eq(salesPreferenceTable.prefKey, prefKey)))
      .limit(1);
    return row ? row.value : null;
  }

  async set(prefKey: string, companyId: string, value: unknown): Promise<void> {
    const [existing] = await db
      .select()
      .from(salesPreferenceTable)
      .where(and(eq(salesPreferenceTable.companyId, companyId), eq(salesPreferenceTable.prefKey, prefKey)))
      .limit(1);

    if (existing) {
      await db
        .update(salesPreferenceTable)
        .set({ value, updatedAt: new Date() } as never)
        .where(eq(salesPreferenceTable.id, existing.id));
      return;
    }
    await db.insert(salesPreferenceTable).values({ companyId, prefKey, value } as never);
  }
}

export const salesPreferenceRepository = new SalesPreferenceRepository();
