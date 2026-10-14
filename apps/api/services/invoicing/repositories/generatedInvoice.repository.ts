import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/db";
import { generatedInvoiceTable } from "../schemas/generatedInvoice.schema";

/** Read-only: invoices made by the old generator before phase 3 (kept for history). */
class GeneratedInvoiceRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(generatedInvoiceTable)
      .where(and(eq(generatedInvoiceTable.companyId, companyId), eq(generatedInvoiceTable.shipmentId, shipmentId)))
      .orderBy(asc(generatedInvoiceTable.createdAt));
  }
}

export const generatedInvoiceRepository = new GeneratedInvoiceRepository();
