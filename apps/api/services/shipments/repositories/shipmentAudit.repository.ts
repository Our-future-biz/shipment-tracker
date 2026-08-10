import { eq, desc } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentAuditTable } from "../schemas/shipmentAudit.schema";

class ShipmentAuditRepository {
  async listByShipmentId(shipmentId: string, limit = 100) {
    return db
      .select()
      .from(shipmentAuditTable)
      .where(eq(shipmentAuditTable.shipmentId, shipmentId))
      .orderBy(desc(shipmentAuditTable.changedAt))
      .limit(limit);
  }

  async create(data: { companyId: string; shipmentId: string; userId: string; field: string; oldValue?: string | null; newValue?: string | null }) {
    const [row] = await db.insert(shipmentAuditTable).values(data).returning();
    return row!;
  }
}

export const shipmentAuditRepository = new ShipmentAuditRepository();
