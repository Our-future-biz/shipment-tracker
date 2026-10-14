import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { generatedInvoiceTable as t, type GeneratedInvoiceRecord } from "../schemas/generatedInvoice.schema";

/** Read-only: invoices made by the old generator before phase 3 (kept for history). */
class GeneratedInvoiceRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "generated_invoice");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<GeneratedInvoiceRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(asc(t.createdAt));
  }
}

export const generatedInvoiceRepository = new GeneratedInvoiceRepository();
