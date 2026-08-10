import { eq, and } from "drizzle-orm";
import { db } from "../db/db";
import { billingOverrideTable } from "../schemas/billingOverride.schema";

class BillingOverrideRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(billingOverrideTable)
      .where(and(eq(billingOverrideTable.companyId, companyId), eq(billingOverrideTable.shipmentId, shipmentId)));
  }

  async upsert(shipmentId: string, companyId: string, rowKey: string, billingAmount: string | null) {
    const [existing] = await db
      .select()
      .from(billingOverrideTable)
      .where(and(
        eq(billingOverrideTable.companyId, companyId),
        eq(billingOverrideTable.shipmentId, shipmentId),
        eq(billingOverrideTable.rowKey, rowKey),
      ))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(billingOverrideTable)
        .set({ billingAmount, updatedAt: new Date() })
        .where(eq(billingOverrideTable.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await db.insert(billingOverrideTable).values({ companyId, shipmentId, rowKey, billingAmount }).returning();
    return row!;
  }
}

export const billingOverrideRepository = new BillingOverrideRepository();
