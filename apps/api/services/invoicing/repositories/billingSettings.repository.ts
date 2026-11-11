import { and, eq, inArray, isNull } from "drizzle-orm";
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

  /** Billing currency of these shipments' live settings (a shipment without settings bills in CZK). */
  async currenciesOf(companyId: string, shipmentIds: string[]): Promise<{ shipmentId: string; billingCurrency: string }[]> {
    if (!shipmentIds.length) return [];
    return this.db
      .select({ shipmentId: t.shipmentId, billingCurrency: t.billingCurrency })
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, shipmentIds), isNull(t.deletedAt)));
  }

  /** Billing currency of the shipments an Invoicing queue view lists (only those, not the company's every one). */
  async listByShipments(shipmentIds: string[], companyId: string): Promise<{ shipmentId: string; billingCurrency: string }[]> {
    const ids = [...new Set(shipmentIds)];
    if (!ids.length) return [];
    return this.db
      .select({ shipmentId: t.shipmentId, billingCurrency: t.billingCurrency })
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, ids), isNull(t.deletedAt)));
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

  /** The shipment's first billing settings, unless it has some (a save at the same moment included): those stay as they are. */
  async createIfMissing(shipmentId: string, companyId: string, data: BillingSettingsValues): Promise<void> {
    await this.db
      .insert(t)
      .values({ companyId, shipmentId, ...data })
      .onConflictDoNothing({ target: [t.companyId, t.shipmentId] });
  }

  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
  }
}

export const billingSettingsRepository = new BillingSettingsRepository();
