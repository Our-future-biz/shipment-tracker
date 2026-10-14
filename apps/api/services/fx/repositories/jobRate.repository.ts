import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { jobRateTable, type JobRateRecord, type LockedRates } from "../schemas/jobRate.schema";

class JobRateRepository {
  async get(companyId: string, shipmentId: string): Promise<JobRateRecord | null> {
    const [row] = await db
      .select()
      .from(jobRateTable)
      .where(and(eq(jobRateTable.companyId, companyId), eq(jobRateTable.shipmentId, shipmentId)))
      .limit(1);
    return row ?? null;
  }

  // Locks the job at `rateDate`; an existing lock is replaced and the move recorded.
  async lock(companyId: string, shipmentId: string, basis: string, rateDate: string, rates: LockedRates): Promise<JobRateRecord> {
    const now = new Date();
    const [row] = await db
      .insert(jobRateTable)
      .values({ companyId, shipmentId, basis, rateDate, rates, lockedAt: now })
      .onConflictDoUpdate({
        target: [jobRateTable.companyId, jobRateTable.shipmentId],
        set: {
          basis,
          previousRateDate: sql`${jobRateTable.rateDate}`,
          rateDate,
          rates,
          lockedAt: now,
          updatedAt: now,
          relockCount: sql`${jobRateTable.relockCount} + 1`,
        },
      })
      .returning();
    return row!;
  }
}

export const jobRateRepository = new JobRateRepository();
