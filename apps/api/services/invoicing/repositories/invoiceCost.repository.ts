import { eq, and } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceCostTable } from "../schemas/invoiceCost.schema";

class InvoiceCostRepository {
  async listByShipmentId(shipmentId: string) {
    return db.select().from(invoiceCostTable).where(eq(invoiceCostTable.shipmentId, shipmentId));
  }

  async upsert(shipmentId: string, category: string, data: Partial<{ estAmount: string; estCurrency: string; realAmount: string; realCurrency: string; invoiceNumber: string; vendor: string }>) {
    const [existing] = await db
      .select()
      .from(invoiceCostTable)
      .where(and(eq(invoiceCostTable.shipmentId, shipmentId), eq(invoiceCostTable.category, category)))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(invoiceCostTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(invoiceCostTable.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await db.insert(invoiceCostTable).values({ shipmentId, category, ...data }).returning();
    return row!;
  }
}

export const invoiceCostRepository = new InvoiceCostRepository();
