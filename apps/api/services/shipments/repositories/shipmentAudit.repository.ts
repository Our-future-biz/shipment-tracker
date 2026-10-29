import { db, type Tx } from "../db/db";
import { shipmentAuditTable, type NewShipmentAuditRecord } from "../schemas/shipmentAudit.schema";

// The audit log is append-only and has no created/updated/deleted columns, so it does not use
// the tenant base repository; every entry is written with the shipment's company.
class ShipmentAuditRepository {
  async create(data: NewShipmentAuditRecord, tx: Tx | typeof db = db): Promise<void> {
    await tx.insert(shipmentAuditTable).values(data);
  }
}

export const shipmentAuditRepository = new ShipmentAuditRepository();
