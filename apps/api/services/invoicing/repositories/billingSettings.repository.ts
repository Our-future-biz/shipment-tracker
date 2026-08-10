import { eq, and } from "drizzle-orm";
import { db } from "../db/db";
import { billingSettingsTable } from "../schemas/billingSettings.schema";

class BillingSettingsRepository {
  async getByShipmentId(shipmentId: string, companyId: string) {
    const [row] = await db
      .select()
      .from(billingSettingsTable)
      .where(and(eq(billingSettingsTable.companyId, companyId), eq(billingSettingsTable.shipmentId, shipmentId)))
      .limit(1);
    return row ?? null;
  }

  async upsert(shipmentId: string, companyId: string, data: Partial<{ billingCurrency: string; roe: string; quoteRef: string }>) {
    const existing = await this.getByShipmentId(shipmentId, companyId);
    if (existing) {
      const [row] = await db
        .update(billingSettingsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(billingSettingsTable.id, existing.id))
        .returning();
      return row!;
    }
    const [row] = await db.insert(billingSettingsTable).values({ companyId, shipmentId, ...data }).returning();
    return row!;
  }
}

export const billingSettingsRepository = new BillingSettingsRepository();
