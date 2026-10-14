import { and, asc, count as drizzleCount, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { generatedInvoiceTable as t, type GeneratedInvoiceRecord } from "../schemas/generatedInvoice.schema";

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

  /** The job number + the shipment's next sequence (JOB-001); deleted invoices keep their number. */
  async getNextInvoiceNumber(jobNumber: string, shipmentId: string, companyId: string): Promise<string> {
    const [result] = await this.db
      .select({ value: drizzleCount() })
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId)));
    const nextSeq = Number(result?.value ?? 0) + 1;
    return `${jobNumber}-${String(nextSeq).padStart(3, "0")}`;
  }
}

export const generatedInvoiceRepository = new GeneratedInvoiceRepository();
