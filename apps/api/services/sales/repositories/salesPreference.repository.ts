import { and, eq, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { salesPreferenceTable } from "../schemas/salesPreference.schema";

class SalesPreferenceRepository extends TenantRepository<typeof salesPreferenceTable> {
  constructor() {
    super(db, salesPreferenceTable, "sales_preference");
  }

  async get(prefKey: string, companyId: string): Promise<unknown | null> {
    const [row] = await this.db
      .select({ value: salesPreferenceTable.value })
      .from(salesPreferenceTable)
      .where(and(
        eq(salesPreferenceTable.companyId, companyId),
        eq(salesPreferenceTable.prefKey, prefKey),
        isNull(salesPreferenceTable.deletedAt),
      ))
      .limit(1);
    return row ? row.value : null;
  }

  // One statement, so two saves at once can't both insert and trip the unique key.
  async set(prefKey: string, companyId: string, value: unknown): Promise<void> {
    await this.db
      .insert(salesPreferenceTable)
      .values({ companyId, prefKey, value })
      .onConflictDoUpdate({
        target: [salesPreferenceTable.companyId, salesPreferenceTable.prefKey],
        targetWhere: sql`deleted_at IS NULL`,
        set: { value, updatedAt: new Date() },
      });
  }
}

export const salesPreferenceRepository = new SalesPreferenceRepository();
