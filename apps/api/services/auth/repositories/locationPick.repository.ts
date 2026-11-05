import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { locationPickTable } from "../schemas/locationPick.schema";

class LocationPickRepository {
  /** One more pick of `code` by the user. */
  async record(companyId: string, userId: string, code: string): Promise<void> {
    await db
      .insert(locationPickTable)
      .values({ companyId, userId, code, picks: 1, lastPickedAt: new Date() })
      .onConflictDoUpdate({
        target: [locationPickTable.companyId, locationPickTable.userId, locationPickTable.code],
        set: { picks: sql`${locationPickTable.picks} + 1`, lastPickedAt: new Date() },
      });
  }

  /** How often the user picked each code they ever picked. */
  async countsFor(companyId: string, userId: string): Promise<Map<string, number>> {
    const rows = await db
      .select({ code: locationPickTable.code, picks: locationPickTable.picks })
      .from(locationPickTable)
      .where(and(eq(locationPickTable.companyId, companyId), eq(locationPickTable.userId, userId)));
    return new Map(rows.map((r) => [r.code, r.picks]));
  }
}

export const locationPickRepository = new LocationPickRepository();
