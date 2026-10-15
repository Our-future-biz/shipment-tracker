import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { roeSettingTable as t, type RoeSettingRecord } from "../schemas/roeSetting.schema";

class RoeSettingRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "roe_setting");
  }

  // The setting in force on `date`: newest effective date first, then the latest change that day.
  async inForce(companyId: string, date: string): Promise<RoeSettingRecord | null> {
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), lte(t.effectiveFrom, date), isNull(t.deletedAt)))
      .orderBy(desc(t.effectiveFrom), desc(t.createdAt))
      .limit(1);
    return row ?? null;
  }

  async history(companyId: string): Promise<RoeSettingRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt)))
      .orderBy(desc(t.effectiveFrom), desc(t.createdAt));
  }
}

export const roeSettingRepository = new RoeSettingRepository();
