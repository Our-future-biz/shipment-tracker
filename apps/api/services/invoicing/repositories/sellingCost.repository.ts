import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceSellingCostTable } from "../schemas/invoiceSellingCost.schema";

class SellingCostRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(invoiceSellingCostTable)
      .where(and(
        eq(invoiceSellingCostTable.companyId, companyId),
        eq(invoiceSellingCostTable.shipmentId, shipmentId),
      ))
      .orderBy(asc(invoiceSellingCostTable.sortOrder), asc(invoiceSellingCostTable.createdAt));
  }

  async create(data: { companyId: string; shipmentId: string } & Record<string, unknown>) {
    const [row] = await db.insert(invoiceSellingCostTable).values(data as never).returning();
    return row!;
  }

  /** shipmentId is part of the where clause so a row can only be written through its own shipment's URL. */
  async update(id: string, companyId: string, shipmentId: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(invoiceSellingCostTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(invoiceSellingCostTable.id, id),
        eq(invoiceSellingCostTable.companyId, companyId),
        eq(invoiceSellingCostTable.shipmentId, shipmentId),
      ))
      .returning();
    return row ?? null;
  }

  async delete(id: string, companyId: string, shipmentId: string) {
    const deleted = await db
      .delete(invoiceSellingCostTable)
      .where(and(
        eq(invoiceSellingCostTable.id, id),
        eq(invoiceSellingCostTable.companyId, companyId),
        eq(invoiceSellingCostTable.shipmentId, shipmentId),
      ))
      .returning({ id: invoiceSellingCostTable.id });
    return deleted.length > 0;
  }
}

export const sellingCostRepository = new SellingCostRepository();
