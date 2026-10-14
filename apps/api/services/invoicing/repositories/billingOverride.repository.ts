import { and, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { billingOverrideTable as t, type BillingOverrideRecord } from "../schemas/billingOverride.schema";

class BillingOverrideRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "billing_override");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<BillingOverrideRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
  }

  // One statement on the (company, shipment, row) key, so two saves can't both insert.
  async upsert(shipmentId: string, companyId: string, rowKey: string, billingAmount: string | null): Promise<BillingOverrideRecord> {
    const [row] = await this.db
      .insert(t)
      .values({ companyId, shipmentId, rowKey, billingAmount })
      .onConflictDoUpdate({
        target: [t.companyId, t.shipmentId, t.rowKey],
        set: { billingAmount, updatedAt: new Date(), deletedAt: null },
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

export const billingOverrideRepository = new BillingOverrideRepository();
