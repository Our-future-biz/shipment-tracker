import { eq, and, isNull, asc, sql } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentClaimTable } from "../schemas/shipmentClaim.schema";
import { shipmentTable } from "../schemas/shipment.schema";

type ClaimFields = Partial<typeof shipmentClaimTable.$inferInsert>;

class ShipmentClaimRepository {
  async listByShipmentId(shipmentId: string, companyId: string) {
    return db
      .select()
      .from(shipmentClaimTable)
      .where(and(eq(shipmentClaimTable.companyId, companyId), eq(shipmentClaimTable.shipmentId, shipmentId), isNull(shipmentClaimTable.deletedAt)))
      .orderBy(asc(shipmentClaimTable.createdAt));
  }

  async create(data: { companyId: string; shipmentId: string; kind: string } & ClaimFields) {
    const [row] = await db.insert(shipmentClaimTable).values(data).returning();
    return row!;
  }

  async update(id: string, companyId: string, data: ClaimFields) {
    const [row] = await db
      .update(shipmentClaimTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(shipmentClaimTable.id, id), eq(shipmentClaimTable.companyId, companyId), isNull(shipmentClaimTable.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** Returns the shipment the deleted claim belonged to (null when nothing was deleted). */
  async delete(id: string, companyId: string) {
    const [row] = await db
      .update(shipmentClaimTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shipmentClaimTable.id, id), eq(shipmentClaimTable.companyId, companyId), isNull(shipmentClaimTable.deletedAt)))
      .returning({ shipmentId: shipmentClaimTable.shipmentId });
    return row?.shipmentId ?? null;
  }

  /**
   * Keeps the shipment's "Claim" field in step with its claims: Yes while at
   * least one claim row has something filled in, No otherwise. A row freshly
   * added with "+" is still blank and does not count.
   */
  async syncShipmentFlag(shipmentId: string, companyId: string) {
    await db
      .update(shipmentTable)
      .set({
        claim: sql`CASE WHEN EXISTS (
          SELECT 1 FROM shipment_claim c
          WHERE c.shipment_id = ${shipmentId}
            AND c.company_id = ${companyId}
            AND c.deleted_at IS NULL
            AND btrim(c.cargo_state || c.note || c.supplier || c.invoice_number || c.reason || c.amount) <> ''
        ) THEN 'Yes' ELSE 'No' END`,
      })
      .where(and(eq(shipmentTable.id, shipmentId), eq(shipmentTable.companyId, companyId)));
  }
}

export const shipmentClaimRepository = new ShipmentClaimRepository();
