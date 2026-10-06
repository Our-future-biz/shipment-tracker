import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { userPreferenceTable } from "../schemas/userPreference.schema";

class UserPreferenceRepository {
  async get(companyId: string, userId: string, prefKey: string) {
    const [row] = await db
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

  async set(companyId: string, userId: string, prefKey: string, value: unknown) {
    const existing = await this.get(companyId, userId, prefKey);
    if (existing) {
      await db
        .update(userPreferenceTable)
        .set({ value: value as never, updatedAt: new Date() })
        .where(eq(userPreferenceTable.id, existing.id));
      return;
    }
    await db.insert(userPreferenceTable).values({
      companyId, userId, prefKey, value: value as never,
    });
  }
}

export const userPreferenceRepository = new UserPreferenceRepository();
