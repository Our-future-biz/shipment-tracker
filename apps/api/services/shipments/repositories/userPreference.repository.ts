import { eq, and, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { userPreferenceTable, type UserPreferenceRecord } from "../schemas/userPreference.schema";

class UserPreferenceRepository extends TenantRepository<typeof userPreferenceTable> {
  constructor() {
    super(db, userPreferenceTable, "user_preference");
  }

  async get(companyId: string, userId: string, prefKey: string): Promise<UserPreferenceRecord | null> {
    const [row] = await this.db
      .select()
      .from(userPreferenceTable)
      .where(and(
        eq(userPreferenceTable.companyId, companyId),
        eq(userPreferenceTable.userId, userId),
        eq(userPreferenceTable.prefKey, prefKey),
        isNull(userPreferenceTable.deletedAt),
      ))
      .limit(1);
    return row ?? null;
  }

  // One statement, so two saves at once can't both insert.
  async set(companyId: string, userId: string, prefKey: string, value: unknown): Promise<void> {
    await this.db
      .insert(userPreferenceTable)
      .values({ companyId, userId, prefKey, value })
      .onConflictDoUpdate({
        target: [userPreferenceTable.companyId, userPreferenceTable.userId, userPreferenceTable.prefKey],
        targetWhere: sql`deleted_at IS NULL`,
        set: { value, updatedAt: new Date() },
      });
  }
}

export const userPreferenceRepository = new UserPreferenceRepository();
