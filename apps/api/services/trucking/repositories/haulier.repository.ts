import { and, asc, count, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import {
  truckingHaulierProfileTable,
  truckingPreferredLaneTable,
  type NewTruckingHaulierProfileRecord,
  type TruckingHaulierProfileRecord,
  type TruckingPreferredLaneRecord,
} from "../schemas/truckingHaulier.schema";
import type { HaulierProfileInput } from "../interfaces/interfaces";
import { TenantRepository } from "../../../lib/db/repository";
import { appendEvent, type TruckingEventInput } from "./event.repository";

const p = truckingHaulierProfileTable;
const l = truckingPreferredLaneTable;

export interface StoredProfile {
  profile: TruckingHaulierProfileRecord;
  lanes: TruckingPreferredLaneRecord[];
}

/** Profile columns a save or a block may write. */
type ProfileValues = Omit<HaulierProfileInput, "preferredLanes"> &
  Partial<Pick<NewTruckingHaulierProfileRecord, "blocked" | "blockReason" | "blockedAt" | "blockedBy">>;

class HaulierRepository extends TenantRepository<typeof truckingHaulierProfileTable> {
  constructor() {
    super(db, truckingHaulierProfileTable, "trucking_haulier_profile");
  }

  async find(companyId: string, customerId: string): Promise<StoredProfile | null> {
    const [profile] = await db
      .select()
      .from(p)
      .where(and(eq(p.companyId, companyId), eq(p.customerId, customerId), isNull(p.deletedAt)));
    if (!profile) return null;
    const lanes = await db
      .select()
      .from(l)
      .where(and(eq(l.companyId, companyId), eq(l.profileId, profile.id), isNull(l.deletedAt)))
      .orderBy(asc(l.createdAt), asc(l.id));
    return { profile, lanes };
  }

  /** Every live profile of the company with its number of live lanes. */
  async listWithLaneCounts(companyId: string): Promise<{ profile: TruckingHaulierProfileRecord; laneCount: number }[]> {
    const [profiles, counts] = await Promise.all([
      db.select().from(p).where(and(eq(p.companyId, companyId), isNull(p.deletedAt))),
      db
        .select({ profileId: l.profileId, n: count() })
        .from(l)
        .where(and(eq(l.companyId, companyId), isNull(l.deletedAt)))
        .groupBy(l.profileId),
    ]);
    const byProfile = new Map(counts.map((c) => [c.profileId, Number(c.n)]));
    return profiles.map((profile) => ({ profile, laneCount: byProfile.get(profile.id) ?? 0 }));
  }

  // Writes the profile only if it is still at `expectedVersion` (0 = none saved yet), together with
  // its lanes (when given) and the event, in one transaction. Null when someone saved meanwhile:
  // the conditional UPDATE (or the insert against the one-live-profile index) touches no row.
  async save(
    companyId: string,
    customerId: string,
    expectedVersion: number,
    values: ProfileValues,
    lanes: HaulierProfileInput["preferredLanes"] | null,
    event: TruckingEventInput,
  ): Promise<TruckingHaulierProfileRecord | null> {
    return db.transaction(async (tx) => {
      let row: TruckingHaulierProfileRecord | undefined;
      if (expectedVersion === 0) {
        [row] = await tx.insert(p).values({ companyId, customerId, ...values, version: 1 }).onConflictDoNothing().returning();
      } else {
        [row] = await tx
          .update(p)
          .set({ ...values, version: sql`${p.version} + 1`, updatedAt: new Date() })
          .where(and(eq(p.companyId, companyId), eq(p.customerId, customerId), isNull(p.deletedAt), eq(p.version, expectedVersion)))
          .returning();
      }
      if (!row) return null;
      if (lanes) await this.replaceLanes(tx, companyId, row, lanes);
      await appendEvent(tx, companyId, { ...event, customerId });
      return row;
    });
  }

  // Lanes sent with an id that belongs to the profile are updated, the others are added, and the
  // profile's lanes no longer sent are soft-deleted.
  private async replaceLanes(tx: Tx, companyId: string, profile: TruckingHaulierProfileRecord, lanes: HaulierProfileInput["preferredLanes"]) {
    const live = and(eq(l.companyId, companyId), eq(l.profileId, profile.id), isNull(l.deletedAt));
    const existing = new Set((await tx.select({ id: l.id }).from(l).where(live)).map((r) => r.id));
    const kept = lanes.map((x) => x.id).filter((id): id is string => !!id && existing.has(id));
    const now = new Date();
    await tx
      .update(l)
      .set({ deletedAt: now, updatedAt: now })
      .where(kept.length ? and(live, notInArray(l.id, kept)) : live);
    for (const lane of lanes) {
      const { id, ...values } = lane;
      if (id && existing.has(id)) {
        await tx.update(l).set({ ...values, updatedAt: now }).where(and(live, eq(l.id, id)));
      } else {
        await tx.insert(l).values({ ...values, companyId, profileId: profile.id, customerId: profile.customerId });
      }
    }
  }
}

export const haulierRepository = new HaulierRepository();
