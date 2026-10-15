import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
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

  // National (not regional) Czech holidays that overlap from..to, both yyyy-mm-dd.
  async listCzNationalOverlapping(companyId: string, from: string, to: string): Promise<PublicHolidayRecord[]> {
    return this.db
      .select()
      .from(publicHolidayTable)
      .where(
        and(
          eq(publicHolidayTable.companyId, companyId),
          isNull(publicHolidayTable.deletedAt),
          eq(publicHolidayTable.countryCode, "CZ"),
          eq(publicHolidayTable.regions, ""),
          lte(publicHolidayTable.nationalStart, to),
          gte(sql`coalesce(${publicHolidayTable.nationalEnd}, ${publicHolidayTable.nationalStart})`, from),
        ),
      )
      .orderBy(asc(publicHolidayTable.nationalStart));
  }

  async insertMany(rows: NewPublicHolidayRecord[]): Promise<void> {
    // Batches keep each statement well under Postgres' parameter limit.
    for (let i = 0; i < rows.length; i += 500) {
      await this.db.insert(publicHolidayTable).values(rows.slice(i, i + 500));
    }
  }
}

export const publicHolidayRepository = new PublicHolidayRepository();
