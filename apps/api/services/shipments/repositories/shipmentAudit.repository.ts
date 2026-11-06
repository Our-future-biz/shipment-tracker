import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { shipmentAuditTable, type NewShipmentAuditRecord, type ShipmentAuditRecord } from "../schemas/shipmentAudit.schema";

// The audit log is append-only and has no created/updated/deleted columns, so it does not use
// the tenant base repository; every entry is written with the shipment's company.
class ShipmentAuditRepository {
  async create(data: NewShipmentAuditRecord, tx: Tx | typeof db = db): Promise<void> {
    await tx.insert(shipmentAuditTable).values(data);
  }

  /** A shipment's changes of the given fields, newest first. */
  async listByShipmentId(shipmentId: string, companyId: string, fields: readonly string[], limit: number): Promise<ShipmentAuditRecord[]> {
    return db
      .select()
      .from(shipmentAuditTable)
      .where(and(
        eq(shipmentAuditTable.companyId, companyId),
        eq(shipmentAuditTable.shipmentId, shipmentId),
        inArray(shipmentAuditTable.field, [...fields]),
      ))
      .orderBy(desc(shipmentAuditTable.changedAt), desc(shipmentAuditTable.id))
      .limit(limit);
  }
}

export const shipmentAuditRepository = new ShipmentAuditRepository();
