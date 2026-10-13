import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/db";
import { generatedInvoiceTable } from "../schemas/generatedInvoice.schema";

class GeneratedInvoiceRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(generatedInvoiceTable)
      .where(and(eq(generatedInvoiceTable.companyId, companyId), eq(generatedInvoiceTable.shipmentId, shipmentId)))
      .orderBy(asc(generatedInvoiceTable.createdAt));
  }

  /** All invoice numbers of a shipment, to find the next number in its series. */
  async listNumbersByShipmentId(shipmentId: string, companyId: string): Promise<string[]> {
    const rows = await db
      .select({ invoiceNumber: generatedInvoiceTable.invoiceNumber })
      .from(generatedInvoiceTable)
      .where(and(eq(generatedInvoiceTable.companyId, companyId), eq(generatedInvoiceTable.shipmentId, shipmentId)));
    return rows.map((r) => r.invoiceNumber);
  }

  async create(data: { companyId: string; shipmentId: string; invoiceNumber: string; invoiceType: string; billingCurrency: string; totalAmount: string }) {
    const [row] = await db.insert(generatedInvoiceTable).values(data).returning();
    return row!;
  }
}

export const generatedInvoiceRepository = new GeneratedInvoiceRepository();
