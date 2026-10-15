import { and, eq, isNull, max, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { invoiceCostTable, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable, type NewInvoiceSellingCostRecord } from "../schemas/invoiceSellingCost.schema";
import { invoiceRepository } from "./invoice.repository";
import { sellingReplaceable } from "../utils/truckingLines.utils";
import type { TruckingLinesResult } from "../interfaces/interfaces";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CostTable = typeof invoiceCostTable | typeof invoiceSellingCostTable;

/** Rows as a push writes them, without the shipment, company, tag and sort order. */
export type TruckingBuyingValues = Omit<NewInvoiceCostRecord, "companyId" | "shipmentId" | "sourceTruckingRef" | "sortOrder">;
export type TruckingSellingValues = Omit<NewInvoiceSellingCostRecord, "companyId" | "shipmentId" | "sourceTruckingRef" | "sortOrder">;

class TruckingLinesRepository {
  /**
   * Replaces the live rows a Trucking sourceRef keeps in a shipment's Costs Breakdown, in one
   * transaction: the old rows are soft-deleted and the new ones added after the shipment's last
   * row. Selling rows of the ref already on an issued, not credited invoice are never touched -
   * then the whole selling side of the ref stays as it is and the answer counts them as kept.
   * An advisory lock on the shipment keeps two pushes from interleaving.
   */
  async replace(
    companyId: string,
    shipmentId: string,
    sourceRef: string,
    buying: TruckingBuyingValues[],
    selling: TruckingSellingValues[],
  ): Promise<TruckingLinesResult> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trucking-lines:${shipmentId}`}))`);
      const of = (table: CostTable) =>
        and(eq(table.companyId, companyId), eq(table.shipmentId, shipmentId), eq(table.sourceTruckingRef, sourceRef), isNull(table.deletedAt));

      const currentSelling = await tx.select({ id: invoiceSellingCostTable.id }).from(invoiceSellingCostTable).where(of(invoiceSellingCostTable));
      const invoiced = currentSelling.length ? await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx) : new Set<string>();
      const sellingPlan = sellingReplaceable(currentSelling.map((r) => r.id), invoiced);

      const now = new Date();
      await tx.update(invoiceCostTable).set({ deletedAt: now, updatedAt: now }).where(of(invoiceCostTable));
      if (buying.length) {
        const next = await this.nextSort(tx, invoiceCostTable, companyId, shipmentId);
        await tx.insert(invoiceCostTable).values(buying.map((row, i) => ({ ...row, companyId, shipmentId, sourceTruckingRef: sourceRef, sortOrder: next + i })));
      }
      if (sellingPlan.replace) {
        await tx.update(invoiceSellingCostTable).set({ deletedAt: now, updatedAt: now }).where(of(invoiceSellingCostTable));
        if (selling.length) {
          const next = await this.nextSort(tx, invoiceSellingCostTable, companyId, shipmentId);
          await tx
            .insert(invoiceSellingCostTable)
            .values(selling.map((row, i) => ({ ...row, companyId, shipmentId, sourceTruckingRef: sourceRef, sortOrder: next + i })));
        }
      }
      return { buying: buying.length, selling: sellingPlan.replace ? selling.length : 0, sellingKept: sellingPlan.kept };
    });
  }

  // One more than the last sort order of the shipment's live rows on that side.
  private async nextSort(tx: Tx, table: CostTable, companyId: string, shipmentId: string): Promise<number> {
    const [found] = await tx
      .select({ last: max(table.sortOrder) })
      .from(table as PgTable)
      .where(and(eq(table.companyId, companyId), eq(table.shipmentId, shipmentId), isNull(table.deletedAt)));
    return found?.last == null ? 0 : found.last + 1;
  }
}

export const truckingLinesRepository = new TruckingLinesRepository();
