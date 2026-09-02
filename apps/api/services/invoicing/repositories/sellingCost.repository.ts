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

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(invoiceSellingCostTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(invoiceSellingCostTable.id, id), eq(invoiceSellingCostTable.companyId, companyId)))
      .returning();
    return row!;
  }

  async delete(id: string, companyId: string) {
    await db
      .delete(invoiceSellingCostTable)
      .where(and(eq(invoiceSellingCostTable.id, id), eq(invoiceSellingCostTable.companyId, companyId)));
  }
}

export const sellingCostRepository = new SellingCostRepository();
