import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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

  /** Each of these shipments' latest notice. */
  async latestPerShipment(shipmentIds: readonly string[], companyId: string): Promise<Map<string, ShipmentCustomerNoticeRecord>> {
    if (shipmentIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.shipmentId])
      .from(t)
      .where(and(eq(t.companyId, companyId), inArray(t.shipmentId, [...shipmentIds]), isNull(t.deletedAt)))
      .orderBy(t.shipmentId, desc(t.createdAt));
    return new Map(rows.map((r) => [r.shipmentId, r]));
  }
}

export const shipmentCustomerNoticeRepository = new ShipmentCustomerNoticeRepository();
