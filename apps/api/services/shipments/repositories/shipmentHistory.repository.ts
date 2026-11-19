import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentAuditTable as audit } from "../schemas/shipmentAudit.schema";

// A job's history (shipment_audit) as a manager reads it: page by page, the newest first. Read by
// the index on shipment_id; the order is (changed_at, id), so rows written in one turn - which share
// their changed_at - come in a fixed order and none is skipped or repeated between two pages.
class ShipmentHistoryRepository {
  /** Whether the job is the company's - a deleted one too: its history is what is left of it. */
  async isCompanyJob(shipmentId: string, companyId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: shipmentTable.id })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.id, shipmentId), eq(shipmentTable.companyId, companyId)))
      .limit(1);
    return !!row;
  }

  /**
   * Up to `limit` of the job's changes, the newest first; with `before` (a row's id) those older
   * than that row. The row is compared in the database by its own changed_at and id, which keeps
   * the microseconds JavaScript's dates drop. A `before` that is no row of the job gives none.
   */
  async page(shipmentId: string, companyId: string, limit: number, before: string | null) {
    const older = before
      ? sql`(${audit.changedAt}, ${audit.id}) < (SELECT b.changed_at, b.id FROM shipment_audit b WHERE b.id = ${before} AND b.shipment_id = ${shipmentId} AND b.company_id = ${companyId})`
      : undefined;
    return db
      .select({
        id: audit.id,
        userId: audit.userId,
        field: audit.field,
        oldValue: audit.oldValue,
        newValue: audit.newValue,
        changedAt: audit.changedAt,
      })
      .from(audit)
      .where(and(eq(audit.companyId, companyId), eq(audit.shipmentId, shipmentId), older))
      .orderBy(desc(audit.changedAt), desc(audit.id))
      .limit(limit);
  }
}

export const shipmentHistoryRepository = new ShipmentHistoryRepository();
