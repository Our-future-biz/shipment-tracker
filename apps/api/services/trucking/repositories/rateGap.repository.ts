import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { truckingRateGapTable, type TruckingRateGapRecord } from "../schemas/rateGap.schema";
import type { RateGapInput } from "../lib/rateGaps";

const g = truckingRateGapTable;

// Coverage gaps: one row per (company, side, scope, service level, postcode, reason), counted.
class RateGapRepository {
  /** Adds one to each gap (a new gap gets a row). `gaps` must not repeat a key (lib/rateGaps.ts gapsOf). */
  async record(companyId: string, gaps: RateGapInput[], at = new Date()): Promise<void> {
    if (!gaps.length) return;
    await db
      .insert(g)
      .values(gaps.map((x) => ({ companyId, side: x.side, scope: x.scope, serviceLevel: x.serviceLevel ?? "", postcode: x.postcode, reason: x.reason, firstAt: at, lastAt: at })))
      .onConflictDoUpdate({
        target: [g.companyId, g.side, g.scope, g.serviceLevel, g.postcode, g.reason],
        set: { count: sql`${g.count} + 1`, lastAt: at },
      });
  }

  /** Gaps last asked for on a Prague day from `from` to `to` (both included), the most asked for first. */
  async lastIn(companyId: string, from: string, to: string, limit: number): Promise<TruckingRateGapRecord[]> {
    return db
      .select()
      .from(g)
      .where(
        and(
          eq(g.companyId, companyId),
          sql`${g.lastAt} >= ((${from}::date)::timestamp AT TIME ZONE 'Europe/Prague')`,
          sql`${g.lastAt} < (((${to}::date) + 1)::timestamp AT TIME ZONE 'Europe/Prague')`,
        ),
      )
      .orderBy(desc(g.count), desc(g.lastAt))
      .limit(limit);
  }
}

export const rateGapRepository = new RateGapRepository();
