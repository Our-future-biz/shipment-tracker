import { eq, asc } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceAdditionalChargeTable } from "../schemas/invoiceAdditionalCharge.schema";

class AdditionalChargeRepository {
  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(invoiceAdditionalChargeTable)
      .where(eq(invoiceAdditionalChargeTable.shipmentId, shipmentId))
      .orderBy(asc(invoiceAdditionalChargeTable.sortOrder));
  }

  async create(data: { shipmentId: string; invoiceNumber?: string; vendor?: string; description?: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string; sortOrder?: number }) {
    const [row] = await db.insert(invoiceAdditionalChargeTable).values(data).returning();
    return row!;
  }

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(invoiceAdditionalChargeTable)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(eq(invoiceAdditionalChargeTable.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string) {
    await db.delete(invoiceAdditionalChargeTable).where(eq(invoiceAdditionalChargeTable.id, id));
  }
}

export const additionalChargeRepository = new AdditionalChargeRepository();
