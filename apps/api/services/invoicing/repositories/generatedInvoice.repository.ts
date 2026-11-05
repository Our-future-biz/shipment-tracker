import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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

  /** Of the shipments, those the old generator made an invoice for (their numbers carry the job's reference too). */
  async shipmentIdsWithInvoices(shipmentIds: string[], companyId: string): Promise<string[]> {
    if (!shipmentIds.length) return [];
    const rows = await this.db
      .selectDistinct({ shipmentId: t.shipmentId })
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), inArray(t.shipmentId, shipmentIds)));
    return rows.map((r) => r.shipmentId);
  }
}

export const generatedInvoiceRepository = new GeneratedInvoiceRepository();
