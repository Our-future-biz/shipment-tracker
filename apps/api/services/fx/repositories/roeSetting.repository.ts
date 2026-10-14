import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db/db";
import { roeSettingTable, type NewRoeSettingRecord, type RoeSettingRecord } from "../schemas/roeSetting.schema";

class RoeSettingRepository {
  async create(data: NewRoeSettingRecord): Promise<RoeSettingRecord> {
    const [row] = await db.insert(roeSettingTable).values(data).returning();
    return row!;
  }

  // The setting in force on `date`: newest effective date first, then the latest change that day.
  async inForce(companyId: string, date: string): Promise<RoeSettingRecord | null> {
    const [row] = await db
      .select()
      .from(roeSettingTable)
      .where(and(eq(roeSettingTable.companyId, companyId), lte(roeSettingTable.effectiveFrom, date), isNull(roeSettingTable.deletedAt)))
      .orderBy(desc(roeSettingTable.effectiveFrom), desc(roeSettingTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  async history(companyId: string): Promise<RoeSettingRecord[]> {
    return db
      .select()
      .from(roeSettingTable)
      .where(and(eq(roeSettingTable.companyId, companyId), isNull(roeSettingTable.deletedAt)))
      .orderBy(desc(roeSettingTable.effectiveFrom), desc(roeSettingTable.createdAt));
  }
}

export const roeSettingRepository = new RoeSettingRepository();
