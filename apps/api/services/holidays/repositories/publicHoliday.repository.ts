import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { publicHolidayTable, type NewPublicHolidayRecord, type PublicHolidayRecord } from "../schemas/publicHoliday.schema";

class PublicHolidayRepository extends TenantRepository<typeof publicHolidayTable> {
  constructor() {
    super(db, publicHolidayTable, "public_holiday");
  }

  // The whole list (no row cap), by country and date.
  async listAllForCompany(companyId: string): Promise<PublicHolidayRecord[]> {
    return this.db
      .select()
      .from(publicHolidayTable)
      .where(and(eq(publicHolidayTable.companyId, companyId), isNull(publicHolidayTable.deletedAt)))
      .orderBy(asc(publicHolidayTable.country), asc(publicHolidayTable.nationalStart), asc(publicHolidayTable.regionalStart));
  }

  async insertMany(rows: NewPublicHolidayRecord[]): Promise<void> {
    // Batches keep each statement well under Postgres' parameter limit.
    for (let i = 0; i < rows.length; i += 500) {
      await this.db.insert(publicHolidayTable).values(rows.slice(i, i + 500));
    }
  }
}

export const publicHolidayRepository = new PublicHolidayRepository();
