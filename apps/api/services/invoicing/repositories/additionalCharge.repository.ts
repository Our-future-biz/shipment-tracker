import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceAdditionalChargeTable } from "../schemas/invoiceAdditionalCharge.schema";

class AdditionalChargeRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(invoiceAdditionalChargeTable)
      .where(and(eq(invoiceAdditionalChargeTable.companyId, companyId), eq(invoiceAdditionalChargeTable.shipmentId, shipmentId)))
      .orderBy(asc(invoiceAdditionalChargeTable.sortOrder));
  }

  async create(data: { companyId: string; shipmentId: string; invoiceNumber?: string; vendor?: string; description?: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string; sortOrder?: number }) {
    const [row] = await db.insert(invoiceAdditionalChargeTable).values(data).returning();
    return row!;
  }

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(invoiceAdditionalChargeTable)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(and(eq(invoiceAdditionalChargeTable.id, id), eq(invoiceAdditionalChargeTable.companyId, companyId)))
      .returning();
    return row ?? null;
  }

  async delete(id: string, companyId: string) {
    await db
      .delete(invoiceAdditionalChargeTable)
      .where(and(eq(invoiceAdditionalChargeTable.id, id), eq(invoiceAdditionalChargeTable.companyId, companyId)));
  }
}

export const additionalChargeRepository = new AdditionalChargeRepository();
