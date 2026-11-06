import { and, desc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentCustomerNoticeTable as t, type ShipmentCustomerNoticeRecord } from "../schemas/shipmentCustomerNotice.schema";

class ShipmentCustomerNoticeRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "shipment_customer_notice");
  }

  /** What the customer was told about a shipment, the latest first. */
  async listByShipmentId(shipmentId: string, companyId: string, limit: number): Promise<ShipmentCustomerNoticeRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(limit);
  }
}

export const shipmentCustomerNoticeRepository = new ShipmentCustomerNoticeRepository();
