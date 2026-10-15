import { and, eq, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { jobRateTable as t, type JobRateRecord, type LockedRates } from "../schemas/jobRate.schema";
import type { LockBasis } from "../interfaces/interfaces";

class JobRateRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "job_rate");
  }

  async get(companyId: string, shipmentId: string): Promise<JobRateRecord | null> {
    return this.getByColumnForCompany(t.shipmentId, shipmentId, companyId);
  }

  /**
   * Locks the job at `rateDate`. A lock at another date is replaced and the move recorded
   * (previous date, re-lock count); a lock already at this date is left alone, so two first
   * reads at once can't count a re-lock that never happened. A retired row (deleted
   * shipment) is revived as a fresh lock.
   */
  async lock(companyId: string, shipmentId: string, basis: LockBasis, rateDate: string, rates: LockedRates): Promise<JobRateRecord> {
    const now = new Date();
    const moved = sql`${t.rateDate} <> excluded.rate_date AND ${t.deletedAt} IS NULL`;
    const [row] = await this.db
      .insert(t)
      .values({ companyId, shipmentId, basis, rateDate, rates, lockedAt: now })
      .onConflictDoUpdate({
        target: [t.companyId, t.shipmentId],
        set: {
          basis,
          previousRateDate: sql`CASE WHEN ${moved} THEN ${t.rateDate} ELSE ${t.previousRateDate} END`,
          relockCount: sql`CASE WHEN ${moved} THEN ${t.relockCount} + 1 ELSE ${t.relockCount} END`,
          rateDate,
          rates,
          lockedAt: now,
          updatedAt: now,
          deletedAt: null,
        },
        setWhere: sql`${t.rateDate} <> excluded.rate_date OR ${t.deletedAt} IS NOT NULL`,
      })
      .returning();
    if (row) return row;
    // Already locked at this date (by this or a concurrent read).
    const current = await this.get(companyId, shipmentId);
    if (!current) throw new Error("job_rate lock vanished");
    return current;
  }

  /** A deleted shipment's lock is retired with it. */
  async softDeleteForShipment(companyId: string, shipmentId: string): Promise<void> {
    await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
  }
}

export const jobRateRepository = new JobRateRepository();
