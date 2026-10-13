import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/db";
import { customsInvoiceLineTable, customsInvoiceTable } from "../schemas/customsInvoice.schema";

class CustomsInvoiceRepository {
  async listLines(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(customsInvoiceLineTable)
      .where(and(eq(customsInvoiceLineTable.companyId, companyId), eq(customsInvoiceLineTable.shipmentId, shipmentId)))
      .orderBy(asc(customsInvoiceLineTable.sortOrder), asc(customsInvoiceLineTable.createdAt));
  }

  async createLine(data: { companyId: string; shipmentId: string; category?: string; currency?: string; value?: string | null; sortOrder?: number }) {
    const [row] = await db.insert(customsInvoiceLineTable).values(data).returning();
    return row!;
  }

  async updateLine(id: string, companyId: string, shipmentId: string, data: Record<string, unknown>) {
    const [row] = await db
      .update(customsInvoiceLineTable)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(
        and(
          eq(customsInvoiceLineTable.id, id),
          eq(customsInvoiceLineTable.companyId, companyId),
          eq(customsInvoiceLineTable.shipmentId, shipmentId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async deleteLine(id: string, companyId: string, shipmentId: string) {
    await db
      .delete(customsInvoiceLineTable)
      .where(
        and(
          eq(customsInvoiceLineTable.id, id),
          eq(customsInvoiceLineTable.companyId, companyId),
          eq(customsInvoiceLineTable.shipmentId, shipmentId),
        ),
      );
  }

  async getInvoice(shipmentId: string, companyId: string) {
    const [row] = await db
      .select()
      .from(customsInvoiceTable)
      .where(and(eq(customsInvoiceTable.companyId, companyId), eq(customsInvoiceTable.shipmentId, shipmentId)))
      .limit(1);
    return row ?? null;
  }

  async upsertInvoice(shipmentId: string, companyId: string, issuedInvoiceNumber: string) {
    const existing = await this.getInvoice(shipmentId, companyId);
    if (existing) {
      const [row] = await db
        .update(customsInvoiceTable)
        .set({ issuedInvoiceNumber, updatedAt: new Date() })
        .where(eq(customsInvoiceTable.id, existing.id))
        .returning();
      return row!;
    }
    const [row] = await db.insert(customsInvoiceTable).values({ companyId, shipmentId, issuedInvoiceNumber }).returning();
    return row!;
  }
}

export const customsInvoiceRepository = new CustomsInvoiceRepository();
