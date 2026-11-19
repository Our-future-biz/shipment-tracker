import { and, desc, eq, gte } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentReleaseOverrideTable, type NewShipmentReleaseOverrideRecord } from "../schemas/shipmentReleaseOverride.schema";

// A manager's release of an unpaid prepayment job (lib/prepaymentStop): written only in the release's own write turn.
class ShipmentReleaseOverrideRepository {
  async create(tx: Tx, row: NewShipmentReleaseOverrideRecord): Promise<void> {
    await tx.insert(shipmentReleaseOverrideTable).values(row);
  }

  /**
   * Writes the row unless one with the same idempotency key is there already (the gate's outbox sent the same
   * release again). Whether it was written: the caller writes the release's history line and note only then.
   */
  async createOnce(tx: Tx, row: NewShipmentReleaseOverrideRecord & { idempotencyKey: string }): Promise<boolean> {
    const o = shipmentReleaseOverrideTable;
    const rows = await tx.insert(o).values(row).onConflictDoNothing({ target: [o.companyId, o.idempotencyKey] }).returning({ id: o.id });
    return rows.length > 0;
  }

  /**
   * The company's releases of unpaid prepayment jobs since `since`, the newest first, each with its
   * job's number: one query by the table's own index (company_id, created_at), for the audit line of
   * Shipments → Managers.
   */
  async listSince(companyId: string, since: Date, limit: number) {
    const o = shipmentReleaseOverrideTable;
    return db
      .select({ shipmentId: o.shipmentId, jobNumber: shipmentTable.jobNumber, kind: o.kind, reason: o.reason, checked: o.checked, by: o.by, createdAt: o.createdAt })
      .from(o)
      .innerJoin(shipmentTable, and(eq(shipmentTable.id, o.shipmentId), eq(shipmentTable.companyId, o.companyId)))
      .where(and(eq(o.companyId, companyId), gte(o.createdAt, since)))
      .orderBy(desc(o.createdAt))
      .limit(limit);
  }
}

export const shipmentReleaseOverrideRepository = new ShipmentReleaseOverrideRepository();
