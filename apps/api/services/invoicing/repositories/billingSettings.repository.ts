import { and, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { billingSettingsTable as t, type BillingSettingsRecord, type NewBillingSettingsRecord } from "../schemas/billingSettings.schema";

type BillingSettingsValues = Pick<Partial<NewBillingSettingsRecord>, "billingCurrency" | "roe" | "quoteRef">;

class BillingSettingsRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "billing_settings");
  }

  async getByShipmentId(shipmentId: string, companyId: string): Promise<BillingSettingsRecord | null> {
    return this.getByColumnForCompany(t.shipmentId, shipmentId, companyId);
  }

  // One statement on the (company, shipment) key, so two saves at once can't both insert.
  async upsert(shipmentId: string, companyId: string, data: BillingSettingsValues): Promise<BillingSettingsRecord> {
    const [row] = await this.db
      .insert(t)
      .values({ companyId, shipmentId, ...data })
      .onConflictDoUpdate({
        target: [t.companyId, t.shipmentId],
        set: { ...data, updatedAt: new Date(), deletedAt: null },
      })
      .returning();
    return row!;
  }

  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
  }
}

export const billingSettingsRepository = new BillingSettingsRepository();
