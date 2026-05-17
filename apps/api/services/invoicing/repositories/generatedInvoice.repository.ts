import { eq, asc, count as drizzleCount } from "drizzle-orm";
import { db } from "../db/db";
import { generatedInvoiceTable } from "../schemas/generatedInvoice.schema";

class GeneratedInvoiceRepository {
  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(generatedInvoiceTable)
      .where(eq(generatedInvoiceTable.shipmentId, shipmentId))
      .orderBy(asc(generatedInvoiceTable.createdAt));
  }

  async getNextInvoiceNumber(jobNumber: string, shipmentId: string): Promise<string> {
    const [{ value: existing }] = await db
      .select({ value: drizzleCount() })
      .from(generatedInvoiceTable)
      .where(eq(generatedInvoiceTable.shipmentId, shipmentId));
    const nextSeq = Number(existing) + 1;
    return `${jobNumber}-${String(nextSeq).padStart(3, "0")}`;
  }

  async create(data: { shipmentId: string; invoiceNumber: string; invoiceType: string; billingCurrency: string; totalAmount: string }) {
    const [row] = await db.insert(generatedInvoiceTable).values(data).returning();
    return row!;
  }
}

export const generatedInvoiceRepository = new GeneratedInvoiceRepository();
