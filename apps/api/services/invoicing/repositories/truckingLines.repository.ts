import { and, asc, eq, isNull, like, max, notInArray, or, sql } from "drizzle-orm";
import log from "encore.dev/log";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { invoiceCostTable, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable, type NewInvoiceSellingCostRecord } from "../schemas/invoiceSellingCost.schema";
import { invoiceRepository } from "./invoice.repository";
import { differenceRef, differencesOf, nextDifferenceNumber, planBuyingReplace, sellingDifference, sellingReplaceable } from "../utils/truckingLines.utils";
import { realRowValues } from "../utils/truckingReal.utils";
import type { TruckingLinesResult, TruckingRealLine } from "../interfaces/interfaces";

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
   * Buying rows keep their real side (a haulier invoice approved, a statement issued): the new rows
   * take it over (planBuyingReplace), and a row with a real side no new row takes over is kept.
   * An advisory lock on the shipment keeps two pushes from interleaving.
   */
  async replace(
    companyId: string,
    shipmentId: string,
    sourceRef: string,
    buying: TruckingBuyingValues[],
    selling: TruckingSellingValues[],
    differenceLabel = "Price change after invoice",
  ): Promise<TruckingLinesResult> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trucking-lines:${shipmentId}`}))`);
      const of = (table: CostTable) =>
        and(eq(table.companyId, companyId), eq(table.shipmentId, shipmentId), eq(table.sourceTruckingRef, sourceRef), isNull(table.deletedAt));

      // The selling set: the ref's rows and the difference lines added to it after an invoice.
      const s = invoiceSellingCostTable;
      const inSet = or(eq(s.sourceTruckingRef, sourceRef), like(s.sourceTruckingRef, `${sourceRef}:diff:%`));
      const ofSet = and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt), inSet);
      const currentSelling = await tx.select({ id: s.id, ref: s.sourceTruckingRef, qty: s.qty, amount: s.amount, currency: s.currency }).from(s).where(ofSet);
      const invoiced = currentSelling.length ? await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx) : new Set<string>();
      const sellingPlan = sellingReplaceable(currentSelling.map((r) => r.id), invoiced);

      const now = new Date();
      const c = invoiceCostTable;
      const currentBuying = await tx
        .select({ id: c.id, description: c.description, realQty: c.realQty, realAmount: c.realAmount, realCurrency: c.realCurrency, invoiceNumber: c.invoiceNumber, received: c.received })
        .from(c)
        .where(of(c))
        .orderBy(asc(c.sortOrder), asc(c.createdAt));
      const plan = planBuyingReplace(currentBuying, buying);
      if (plan.keep.length) log.warn("invoicing: Trucking re-push kept buying rows with a real cost", { shipmentId, sourceRef, kept: plan.keep });
      await tx
        .update(c)
        .set({ deletedAt: now, updatedAt: now })
        .where(plan.keep.length ? and(of(c), notInArray(c.id, plan.keep)) : of(c));
      if (plan.rows.length) {
        const next = await this.nextSort(tx, c, companyId, shipmentId);
        await tx.insert(c).values(plan.rows.map((row, i) => ({ ...row, companyId, shipmentId, sourceTruckingRef: sourceRef, sortOrder: next + i })));
      }
      if (sellingPlan.replace) {
        // Nothing of the set is invoiced: the new lines replace it, difference lines included.
        await tx.update(s).set({ deletedAt: now, updatedAt: now }).where(ofSet);
        if (selling.length) {
          const next = await this.nextSort(tx, s, companyId, shipmentId);
          await tx.insert(s).values(selling.map((row, i) => ({ ...row, companyId, shipmentId, sourceTruckingRef: sourceRef, sortOrder: next + i })));
        }
        return { buying: buying.length, selling: selling.length, sellingKept: 0, differences: [] };
      }
      // The set is on an issued invoice: it stays, and only what changed is billed as its own line (decision 9).
      const difference = sellingDifference(currentSelling, selling);
      const added: typeof currentSelling = [];
      if (difference.length) {
        const everRefs = await tx.select({ ref: s.sourceTruckingRef }).from(s).where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), like(s.sourceTruckingRef, `${sourceRef}:diff:%`)));
        const ref = differenceRef(sourceRef, nextDifferenceNumber(sourceRef, everRefs.map((r) => r.ref)));
        const category = selling[0]?.category ?? "road_freight";
        const next = await this.nextSort(tx, s, companyId, shipmentId);
        const rows = await tx
          .insert(s)
          .values(
            difference.map((d, i) => ({
              category,
              description: differenceLabel,
              customer: differenceLabel,
              qty: "1.00",
              amount: d.amount.toFixed(2),
              currency: d.currency,
              invoice: true,
              companyId,
              shipmentId,
              sourceTruckingRef: ref,
              sortOrder: next + i,
            })),
          )
          .returning({ id: s.id, ref: s.sourceTruckingRef, qty: s.qty, amount: s.amount, currency: s.currency });
        added.push(...rows);
        log.warn("invoicing: Trucking price changed after the invoice; the difference was added as its own line", { shipmentId, sourceRef: ref, difference });
      }
      return { buying: buying.length, selling: 0, sellingKept: sellingPlan.kept, differences: differencesOf([...currentSelling, ...added], sourceRef) };
    });
  }

  /**
   * Sets (or, with no lines, clears) the real side of the live buying rows of a sourceRef, one
   * line per row in sort order, under the same shipment lock as a push. Null (nothing written)
   * when the number of rows is not the number of lines.
   */
  async setReal(companyId: string, shipmentId: string, sourceRef: string, lines: TruckingRealLine[]): Promise<number | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trucking-lines:${shipmentId}`}))`);
      const t = invoiceCostTable;
      const rows = await tx
        .select({ id: t.id, estQty: t.estQty })
        .from(t)
        .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.sourceTruckingRef, sourceRef), isNull(t.deletedAt)))
        .orderBy(asc(t.sortOrder), asc(t.id));
      if (lines.length && rows.length !== lines.length) return null;
      const now = new Date();
      for (const [n, row] of rows.entries()) {
        await tx
          .update(t)
          .set({ ...realRowValues(lines[n] ?? null, row.estQty), updatedAt: now })
          .where(eq(t.id, row.id));
      }
      return rows.length;
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
