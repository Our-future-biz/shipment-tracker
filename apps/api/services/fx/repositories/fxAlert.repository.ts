import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db/db";
import { fxAlertTable, type FxAlertRecord } from "../schemas/fxAlert.schema";

class FxAlertRepository {
  // Raises the alert for a fixing day; returns null when one already exists for it.
  async raise(fixingDate: string, reason: string): Promise<FxAlertRecord | null> {
    const [row] = await db
      .insert(fxAlertTable)
      .values({ fixingDate, reason })
      .onConflictDoNothing({ target: fxAlertTable.fixingDate })
      .returning();
    return row ?? null;
  }

  async markEmailed(id: string, sent: boolean, error: string): Promise<void> {
    await db
      .update(fxAlertTable)
      .set({ emailedAt: sent ? new Date() : null, emailError: error, updatedAt: new Date() })
      .where(eq(fxAlertTable.id, id));
  }

  // Closes every open alert for a fixing on or before `latestFixing` (it has now arrived).
  async resolveUpTo(latestFixing: string): Promise<void> {
    await db
      .update(fxAlertTable)
      .set({ resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(isNull(fxAlertTable.resolvedAt), lte(fxAlertTable.fixingDate, latestFixing)));
  }

  async open(): Promise<FxAlertRecord[]> {
    return db.select().from(fxAlertTable).where(isNull(fxAlertTable.resolvedAt)).orderBy(desc(fxAlertTable.fixingDate));
  }
}

export const fxAlertRepository = new FxAlertRepository();
