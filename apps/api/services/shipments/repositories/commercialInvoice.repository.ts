import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db, type Tx } from "../db/db";
import { commercialInvoiceTable, type CommercialInvoiceRecord } from "../schemas/commercialInvoice.schema";
import type { CommercialInvoiceLine } from "../interfaces/interfaces";

class CommercialInvoiceRepository extends TenantRepository<typeof commercialInvoiceTable> {
  constructor() {
    super(db, commercialInvoiceTable, "commercial_invoice");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<CommercialInvoiceRecord[]> {
    return this.listByShipmentIds([shipmentId], companyId);
  }

  async listByShipmentIds(shipmentIds: string[], companyId: string): Promise<CommercialInvoiceRecord[]> {
    if (shipmentIds.length === 0) return [];
    return this.db
      .select()
      .from(commercialInvoiceTable)
      .where(
        and(
          eq(commercialInvoiceTable.companyId, companyId),
          inArray(commercialInvoiceTable.shipmentId, shipmentIds),
          isNull(commercialInvoiceTable.deletedAt),
        ),
      )
      .orderBy(asc(commercialInvoiceTable.position), asc(commercialInvoiceTable.createdAt));
  }

  // Replace-all: the invoices are edited as one list and nothing references
  // their ids, so drop the shipment's rows and insert the provided set.
  async replaceForShipment(shipmentId: string, companyId: string, lines: CommercialInvoiceLine[], tx: Tx | typeof db = db): Promise<void> {
    await tx
      .delete(commercialInvoiceTable)
      .where(and(eq(commercialInvoiceTable.companyId, companyId), eq(commercialInvoiceTable.shipmentId, shipmentId)));
    if (lines.length === 0) return;
    await tx.insert(commercialInvoiceTable).values(
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

export const commercialInvoiceRepository = new CommercialInvoiceRepository();
