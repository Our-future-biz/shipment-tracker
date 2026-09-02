import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceCostTable } from "../schemas/invoiceCost.schema";

class InvoiceCostRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(invoiceCostTable)
      .where(and(eq(invoiceCostTable.companyId, companyId), eq(invoiceCostTable.shipmentId, shipmentId)))
      .orderBy(asc(invoiceCostTable.sortOrder), asc(invoiceCostTable.createdAt));
  }

  /** Costs Breakdown pracuje s volne pridavatelnymi radky, ne s pevnymi kategoriemi. */
  async create(data: { companyId: string; shipmentId: string } & Record<string, unknown>) {
    const [row] = await db.insert(invoiceCostTable).values(data as never).returning();
    return row!;
  }

  async updateById(id: string, companyId: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(invoiceCostTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(invoiceCostTable.id, id), eq(invoiceCostTable.companyId, companyId)))
      .returning();
    return row!;
  }

  async deleteById(id: string, companyId: string) {
    await db
      .delete(invoiceCostTable)
      .where(and(eq(invoiceCostTable.id, id), eq(invoiceCostTable.companyId, companyId)));
  }

  async upsert(shipmentId: string, companyId: string, category: string, data: Partial<{ estAmount: string; estCurrency: string; realAmount: string; realCurrency: string; invoiceNumber: string; vendor: string }>) {
    const [existing] = await db
      .select()
      .from(invoiceCostTable)
      .where(and(
        eq(invoiceCostTable.companyId, companyId),
        eq(invoiceCostTable.shipmentId, shipmentId),
        eq(invoiceCostTable.category, category),
      ))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(invoiceCostTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(invoiceCostTable.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await db.insert(invoiceCostTable).values({ companyId, shipmentId, category, ...data }).returning();
    return row!;
  }
}

export const invoiceCostRepository = new InvoiceCostRepository();
