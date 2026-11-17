import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { holidayCountryPrefTable as t } from "../schemas/holidayCountryPref.schema";

/** The countries a user cares about (schemas/holidayCountryPref). */
class HolidayCountryPrefRepository {
  async get(companyId: string, userId: string): Promise<string[]> {
    const [row] = await db
      .select({ countries: t.countries })
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.userId, userId), isNull(t.deletedAt)))
      .limit(1);
    return row?.countries ?? [];
  }

  /** Replaces the user's countries. */
  async set(companyId: string, userId: string, countries: string[]): Promise<void> {
    await db
      .insert(t)
      .values({ companyId, userId, countries })
      .onConflictDoUpdate({
        target: [t.companyId, t.userId],
        targetWhere: sql`deleted_at IS NULL`,
        set: { countries, updatedAt: new Date() },
      });
  }
}

export const holidayCountryPrefRepository = new HolidayCountryPrefRepository();
