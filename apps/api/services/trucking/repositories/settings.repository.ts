import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { truckingSettingsTable, type TruckingSettingsRecord } from "../schemas/truckingSettings.schema";
import type { TruckingSettingsInput } from "../interfaces/interfaces";
import { TenantRepository } from "../../../lib/db/repository";
import { appendEvent, type TruckingEventInput } from "./event.repository";

const s = truckingSettingsTable;

class SettingsRepository extends TenantRepository<typeof truckingSettingsTable> {
  constructor() {
    super(db, truckingSettingsTable, "trucking_settings");
  }

  async find(companyId: string): Promise<TruckingSettingsRecord | null> {
    const [row] = await db.select().from(s).where(and(eq(s.companyId, companyId), isNull(s.deletedAt)));
    return row ?? null;
  }

  // Saves the settings only if they are still at `expectedVersion` (0 = none saved yet), together
  // with the event. Null when someone saved meanwhile: the conditional UPDATE (or the insert
  // against the one-live-row-per-company index) then touches no row.
  async save(
    companyId: string,
    expectedVersion: number,
    values: TruckingSettingsInput,
    by: string,
    event: TruckingEventInput,
  ): Promise<TruckingSettingsRecord | null> {
    return db.transaction(async (tx) => {
      let row: TruckingSettingsRecord | undefined;
      if (expectedVersion === 0) {
        [row] = await tx.insert(s).values({ companyId, ...values, version: 1, updatedBy: by }).onConflictDoNothing().returning();
      } else {
        [row] = await tx
          .update(s)
          .set({ ...values, version: sql`${s.version} + 1`, updatedBy: by, updatedAt: new Date() })
          .where(and(eq(s.companyId, companyId), isNull(s.deletedAt), eq(s.version, expectedVersion)))
          .returning();
      }
      if (!row) return null;
      await appendEvent(tx, companyId, event);
      return row;
    });
  }
}

export const settingsRepository = new SettingsRepository();
