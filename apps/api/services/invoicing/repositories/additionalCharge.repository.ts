import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import {
  invoiceAdditionalChargeTable as t,
  type InvoiceAdditionalChargeRecord,
} from "../schemas/invoiceAdditionalCharge.schema";

class AdditionalChargeRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "invoice_additional_charge");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<InvoiceAdditionalChargeRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(asc(t.sortOrder));
  }

  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(t)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)));
  }
}

export const additionalChargeRepository = new AdditionalChargeRepository();
