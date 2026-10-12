import { eq, inArray, asc } from "drizzle-orm";
import { db } from "../db/db";
import { commercialInvoiceTable } from "../schemas/commercialInvoice.schema";
import type { CommercialInvoiceLine } from "../interfaces/interfaces";

class CommercialInvoiceRepository {
  async listByShipmentId(shipmentId: string) {
    return db
      .select()
      .from(commercialInvoiceTable)
      .where(eq(commercialInvoiceTable.shipmentId, shipmentId))
      .orderBy(asc(commercialInvoiceTable.position), asc(commercialInvoiceTable.createdAt));
  }

  async listByShipmentIds(shipmentIds: string[]) {
    if (shipmentIds.length === 0) return [];
    return db
      .select()
      .from(commercialInvoiceTable)
      .where(inArray(commercialInvoiceTable.shipmentId, shipmentIds))
      .orderBy(asc(commercialInvoiceTable.position), asc(commercialInvoiceTable.createdAt));
  }

  // Replace-all: the invoices are edited as one list and nothing references
  // their ids, so drop the shipment's rows and insert the provided set.
  async replaceForShipment(shipmentId: string, companyId: string, lines: CommercialInvoiceLine[]) {
    await db.delete(commercialInvoiceTable).where(eq(commercialInvoiceTable.shipmentId, shipmentId));
    if (lines.length > 0) {
      await db.insert(commercialInvoiceTable).values(
        lines.map((l, i) => ({
          companyId,
          shipmentId,
          position: i,
          invoiceNumber: l.invoiceNumber.trim(),
          value: l.value.trim(),
          currency: l.currency.trim().toUpperCase(),
        })),
      );
    }
  }
}

export const commercialInvoiceRepository = new CommercialInvoiceRepository();
