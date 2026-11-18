import { and, desc, eq, inArray, or } from "drizzle-orm";
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

  /**
   * The newest change of a field on a shipment, for each ask: one row per shipment and field, all
   * asks in one query. An ask names the fields and the shipments it wants them for, so a field
   * that matters on a few shipments only (how long a waiting status has stood) is not read for
   * all of them. For Shipments → Managers' cards.
   */
  async latestByShipmentIds(companyId: string, asks: readonly { fields: readonly string[]; shipmentIds: readonly string[] }[]): Promise<ShipmentAuditRecord[]> {
    const wanted = asks.filter((a) => a.fields.length > 0 && a.shipmentIds.length > 0);
    if (wanted.length === 0) return [];
    return db
      .selectDistinctOn([shipmentAuditTable.shipmentId, shipmentAuditTable.field])
      .from(shipmentAuditTable)
      .where(and(
        eq(shipmentAuditTable.companyId, companyId),
        or(...wanted.map((a) => and(inArray(shipmentAuditTable.field, [...a.fields]), inArray(shipmentAuditTable.shipmentId, [...a.shipmentIds])))),
      ))
      .orderBy(shipmentAuditTable.shipmentId, shipmentAuditTable.field, desc(shipmentAuditTable.changedAt), desc(shipmentAuditTable.id));
  }
}

export const shipmentAuditRepository = new ShipmentAuditRepository();
