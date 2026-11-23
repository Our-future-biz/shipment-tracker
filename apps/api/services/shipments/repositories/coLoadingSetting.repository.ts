import { eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { coLoadingSettingTable as t, type CoLoadingSettingRecord } from "../schemas/coLoadingSetting.schema";

// The one Co-Loading Concept settings row of a company. Every statement names the company.
export const coLoadingSettingRepository = {
  async get(companyId: string): Promise<CoLoadingSettingRecord | null> {
    const [row] = await db.select().from(t).where(eq(t.companyId, companyId)).limit(1);
    return row ?? null;
  },

  /** Writes the company's planning share, whether or not it had one. */
  async savePlanningPct(companyId: string, planningVolumePct: number, userId: string): Promise<CoLoadingSettingRecord> {
    const [row] = await db
      .insert(t)
      .values({ companyId, planningVolumePct, updatedById: userId })
      .onConflictDoUpdate({ target: t.companyId, set: { planningVolumePct, updatedById: userId, updatedAt: sql`now()` } })
      .returning();
    return row!;
  },
};
