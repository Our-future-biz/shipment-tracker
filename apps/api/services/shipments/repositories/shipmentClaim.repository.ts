import { eq, and, isNull, asc, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentClaimTable, type NewShipmentClaimRecord, type ShipmentClaimRecord } from "../schemas/shipmentClaim.schema";
import { shipmentTable } from "../schemas/shipment.schema";

/** The fields of a claim a user fills in. */
export type ClaimFields = Partial<
  Pick<NewShipmentClaimRecord, "cargoState" | "note" | "supplier" | "invoiceNumber" | "reason" | "amount">
>;

const claimOf = (id: string, shipmentId: string, companyId: string) =>
  and(
    eq(shipmentClaimTable.id, id),
    eq(shipmentClaimTable.shipmentId, shipmentId),
    eq(shipmentClaimTable.companyId, companyId),
    isNull(shipmentClaimTable.deletedAt),
  );

class ShipmentClaimRepository extends TenantRepository<typeof shipmentClaimTable> {
  constructor() {
    super(db, shipmentClaimTable, "shipment_claim");
  }

  async listByShipmentId(shipmentId: string, companyId: string): Promise<ShipmentClaimRecord[]> {
    return this.db
      .select()
      .from(shipmentClaimTable)
      .where(and(eq(shipmentClaimTable.companyId, companyId), eq(shipmentClaimTable.shipmentId, shipmentId), isNull(shipmentClaimTable.deletedAt)))
      .orderBy(asc(shipmentClaimTable.createdAt));
  }

  async updateClaim(id: string, shipmentId: string, companyId: string, data: ClaimFields): Promise<ShipmentClaimRecord | null> {
    const [row] = await this.db
      .update(shipmentClaimTable)
      .set({ ...data, updatedAt: new Date() })
      .where(claimOf(id, shipmentId, companyId))
      .returning();
    return row ?? null;
  }

  /** Whether a claim was deleted. */
  async deleteClaim(id: string, shipmentId: string, companyId: string): Promise<boolean> {
    const rows = await this.db
      .update(shipmentClaimTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(claimOf(id, shipmentId, companyId))
      .returning({ id: shipmentClaimTable.id });
    return rows.length > 0;
  }

  /**
   * Keeps the shipment's "Claim" field in step with its claims: Yes while at
   * least one claim row has something filled in, No otherwise. A row freshly
   * added with "+" is still blank and does not count.
   */
  async syncShipmentFlag(shipmentId: string, companyId: string): Promise<void> {
    await this.db
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
