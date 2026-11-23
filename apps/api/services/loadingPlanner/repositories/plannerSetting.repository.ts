import { eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import type { PlannerSettings } from "../interfaces/interfaces";
import { plannerSettingTable as t, type PlannerSettingRecord } from "../schemas/plannerSetting.schema";

/** The settings a stored row holds. */
export const settingsOfRow = (row: PlannerSettingRecord): PlannerSettings => ({
  clearance: { doorWidthMm: row.doorWidthMm, doorHeightMm: row.doorHeightMm, lengthMm: row.lengthMm },
  oogWarning: { widthMm: row.oogWidthMm, overEndMm: row.oogOverEndMm, heightMm: row.oogHeightMm },
  heavyPiece: { warnKg: row.heavyWarnKg, moveKg: row.heavyMoveKg },
});

// The one settings row of a company. Every statement names the company.
export const plannerSettingRepository = {
  async get(companyId: string): Promise<PlannerSettingRecord | null> {
    const [row] = await db.select().from(t).where(eq(t.companyId, companyId)).limit(1);
    return row ?? null;
  },

  /** Writes the company's settings, whether or not it had some. */
  async save(companyId: string, { clearance, oogWarning, heavyPiece }: PlannerSettings, userId: string): Promise<PlannerSettingRecord> {
    const values = {
      ...clearance,
      oogWidthMm: oogWarning.widthMm,
      oogOverEndMm: oogWarning.overEndMm,
      oogHeightMm: oogWarning.heightMm,
      heavyWarnKg: heavyPiece.warnKg,
      heavyMoveKg: heavyPiece.moveKg,
      updatedByUserId: userId,
    };
    const [row] = await db
      .insert(t)
      .values({ companyId, ...values })
      .onConflictDoUpdate({ target: t.companyId, set: { ...values, updatedAt: sql`now()` } })
      .returning();
    return row!;
  },
};
