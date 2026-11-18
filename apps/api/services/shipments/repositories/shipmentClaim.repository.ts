import { eq, and, or, isNull, asc, inArray, sql, type SQL } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentClaimTable, type NewShipmentClaimRecord, type ShipmentClaimRecord } from "../schemas/shipmentClaim.schema";
import { shipmentTable } from "../schemas/shipment.schema";

/** The fields of a claim a user fills in, and the stamps of closing one. */
export type ClaimFields = Partial<
  Pick<
    NewShipmentClaimRecord,
    | "cargoState"
    | "note"
    | "supplier"
    | "invoiceNumber"
    | "reason"
    | "amount"
    | "noticeDate"
    | "supplierInvoiceId"
    | "claimAmount"
    | "claimCurrency"
    | "status"
    | "closedAt"
    | "closedBy"
  >
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

  /** One live claim of the shipment. */
  async findClaim(id: string, shipmentId: string, companyId: string): Promise<ShipmentClaimRecord | null> {
    const [row] = await this.db.select().from(shipmentClaimTable).where(claimOf(id, shipmentId, companyId)).limit(1);
    return row ?? null;
  }

  /**
   * The company's live claims on costs of live shipments that are on any of `shipmentIds` or raised
   * against any of `supplierInvoiceIds`, the oldest first. A deleted shipment's claims are not shown,
   * so they hold no supplier invoice either. Nothing is read when both lists are empty.
   */
  async listCostClaims(companyId: string, shipmentIds: string[], supplierInvoiceIds: string[]): Promise<ShipmentClaimRecord[]> {
    const matches: SQL[] = [];
    if (shipmentIds.length) matches.push(inArray(shipmentClaimTable.shipmentId, shipmentIds));
    if (supplierInvoiceIds.length) matches.push(inArray(shipmentClaimTable.supplierInvoiceId, supplierInvoiceIds));
    if (!matches.length) return [];
    const rows = await this.db
      .select({ claim: shipmentClaimTable })
      .from(shipmentClaimTable)
      .innerJoin(shipmentTable, eq(shipmentTable.id, shipmentClaimTable.shipmentId))
      .where(
        and(
          eq(shipmentClaimTable.companyId, companyId),
          eq(shipmentClaimTable.kind, "cost"),
          isNull(shipmentClaimTable.deletedAt),
          eq(shipmentTable.companyId, companyId),
          isNull(shipmentTable.deletedAt),
          or(...matches),
        ),
      )
      .orderBy(asc(shipmentClaimTable.createdAt), asc(shipmentClaimTable.id));
    return rows.map((r) => r.claim);
  }

  /**
   * The company's OPEN live claims on costs on any of `shipmentIds`, the oldest first: what the
   * Money tab of Shipments → Managers says of them (lib/managersMoney) - the claimed amount and
   * currency, the supplier invoice it is tied to, when it was raised, and the typed fields that
   * tell a claim from a row nobody filled in. One statement, by the jobs' ids (the jobs were read
   * as live ones of the company, so the shipment is not joined). Nothing is read for no ids.
   */
  async openCostClaimsByShipmentIds(companyId: string, shipmentIds: readonly string[]) {
    if (!shipmentIds.length) return [];
    return this.db
      .select({
        shipmentId: shipmentClaimTable.shipmentId,
        createdAt: shipmentClaimTable.createdAt,
        claimAmount: shipmentClaimTable.claimAmount,
        claimCurrency: shipmentClaimTable.claimCurrency,
        supplierInvoiceId: shipmentClaimTable.supplierInvoiceId,
        supplier: shipmentClaimTable.supplier,
        invoiceNumber: shipmentClaimTable.invoiceNumber,
        reason: shipmentClaimTable.reason,
        amount: shipmentClaimTable.amount,
        note: shipmentClaimTable.note,
      })
      .from(shipmentClaimTable)
      .where(
        and(
          eq(shipmentClaimTable.companyId, companyId),
          eq(shipmentClaimTable.kind, "cost"),
          eq(shipmentClaimTable.status, "open"),
          isNull(shipmentClaimTable.deletedAt),
          inArray(shipmentClaimTable.shipmentId, [...shipmentIds]),
        ),
      )
      .orderBy(asc(shipmentClaimTable.createdAt), asc(shipmentClaimTable.id));
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
   * least one claim row has something filled in (a supplier invoice or a claimed
   * amount among them), No otherwise. A row freshly
   * added with "+" is still blank and does not count. A deleted shipment is
   * left as it was deleted.
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
            AND (btrim(c.cargo_state || c.note || c.supplier || c.invoice_number || c.reason || c.amount || c.claim_currency) <> ''
              OR c.supplier_invoice_id IS NOT NULL OR c.claim_amount IS NOT NULL)
        ) THEN 'Yes' ELSE 'No' END`,
      })
      .where(and(eq(shipmentTable.id, shipmentId), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)));
  }
}

export const shipmentClaimRepository = new ShipmentClaimRepository();
