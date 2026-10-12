import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { publicHolidayTable, type NewPublicHolidayRecord } from "../schemas/publicHoliday.schema";

class PublicHolidayRepository {
  async listForCompany(companyId: string) {
    return db
      .select()
      .from(publicHolidayTable)
      .where(and(eq(publicHolidayTable.companyId, companyId), isNull(publicHolidayTable.deletedAt)))
      .orderBy(asc(publicHolidayTable.country), asc(publicHolidayTable.nationalStart), asc(publicHolidayTable.regionalStart));
  }

  async insertMany(rows: NewPublicHolidayRecord[]) {
    if (!rows.length) return;
    // Batches keep each statement well under Postgres' parameter limit.
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(publicHolidayTable).values(rows.slice(i, i + 500));
    }
  }

  async softDelete(id: string, companyId: string) {
    const [row] = await db
      .update(publicHolidayTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(publicHolidayTable.id, id), eq(publicHolidayTable.companyId, companyId), isNull(publicHolidayTable.deletedAt)))
      .returning();
    return row ?? null;
  }
}

export const publicHolidayRepository = new PublicHolidayRepository();
