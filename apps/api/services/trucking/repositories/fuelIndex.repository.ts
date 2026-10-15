import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/db";
import { truckingFuelIndexTable, type TruckingFuelIndexRecord } from "../schemas/truckingFuelIndex.schema";
import { TenantRepository } from "../../../lib/db/repository";
import { appendEvent, type TruckingEventInput } from "./event.repository";

const f = truckingFuelIndexTable;

class FuelIndexRepository extends TenantRepository<typeof truckingFuelIndexTable> {
  constructor() {
    super(db, truckingFuelIndexTable, "trucking_fuel_index");
  }

  /** Every month of the company, newest first. */
  async list(companyId: string): Promise<TruckingFuelIndexRecord[]> {
    return db.select().from(f).where(and(eq(f.companyId, companyId), isNull(f.deletedAt))).orderBy(desc(f.month));
  }

  /** Sets the month's % (adds or overwrites it) together with the event. */
  async set(companyId: string, month: string, percent: number, by: string, event: TruckingEventInput): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .insert(f)
        .values({ companyId, month, percent, updatedBy: by })
        .onConflictDoUpdate({ target: [f.companyId, f.month], set: { percent, updatedBy: by, updatedAt: new Date(), deletedAt: null } });
      await appendEvent(tx, companyId, event);
    });
  }
}

export const fuelIndexRepository = new FuelIndexRepository();
