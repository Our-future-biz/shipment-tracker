import { and, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { billingSettingsTable } from "../schemas/billingSettings.schema";
import { invoiceCostTable, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable, type NewInvoiceSellingCostRecord } from "../schemas/invoiceSellingCost.schema";
import type { CostSide, QuoteImportResult } from "../interfaces/interfaces";
import type { QuoteBuyingRow, QuoteSellingRow } from "../utils/quoteCostImport.utils";
import { invoiceRepository } from "./invoice.repository";
import { sellingAmountRequestRepository } from "./sellingAmountRequest.repository";
import { truckingLinesLock } from "./truckingLines.repository";

type ImportTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The two sides of Costs Breakdown are two tables with the same columns for what a copy needs.
type CostTable = typeof invoiceCostTable | typeof invoiceSellingCostTable;

class QuoteCostImportRepository {
  /**
   * Copies the cost rows of a quote into a shipment's Costs Breakdown - `rows.buying`,
   * `rows.selling`, or both; a side that is left out is not touched. All or nothing, in one
   * transaction: the rows are added after the ones the shipment has, each marked with the quote
   * it came from, and the shipment's quote reference is set.
   *
   * Without `again`, a side that already holds rows of that quote is left as it is - named in
   * `alreadyCopied` - and the other side is still copied; null, with nothing written, when that
   * leaves nothing to copy. An advisory lock on the shipment makes that check hold for two copies
   * started at the same moment: the second waits and then finds the rows of the first.
   *
   * Billing settings made by the copy (the shipment had none) start in `billingCurrency`, when given.
   */
  async copy(
    companyId: string,
    shipmentId: string,
    quoteNumber: string,
    rows: { buying?: QuoteBuyingRow[]; selling?: QuoteSellingRow[] },
    again: boolean,
    billingCurrency?: string,
  ): Promise<QuoteImportResult | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`import-quote:${shipmentId}`}))`);

      const side = (table: CostTable) => this.sideOf(tx, table, companyId, shipmentId, quoteNumber);
      const asked = {
        buying: rows.buying && { rows: rows.buying, ...(await side(invoiceCostTable)) },
        selling: rows.selling && { rows: rows.selling, ...(await side(invoiceSellingCostTable)) },
      };
      // The sides that hold rows of the quote already, which are copied again only when told to.
      const alreadyCopied: CostSide[] = again ? [] : (["buying", "selling"] as const).filter((s) => asked[s]?.copied);
      const buying = alreadyCopied.includes("buying") ? undefined : asked.buying;
      const selling = alreadyCopied.includes("selling") ? undefined : asked.selling;
      if (alreadyCopied.length && !buying?.rows.length && !selling?.rows.length) return null;

      const from = { companyId, shipmentId, sourceQuoteNumber: quoteNumber };
      if (buying?.rows.length) {
        // The buying estimate is the quote's alone, and its lines stay as the quote has them
        // (invoicing.service): what an earlier copy left - of this quote or another - makes way.
        if (buying.quoted > 0) await this.retireBuyingQuoteRows(tx, companyId, shipmentId);
        const values: NewInvoiceCostRecord[] = buying.rows.map((row, i) => ({ ...row, ...from, sortOrder: buying.next + i }));
        await tx.insert(invoiceCostTable).values(values);
        await this.dropSplitEstimates(tx, companyId, shipmentId);
      }
      if (selling?.rows.length) {
        // vatCode stays null: the default by the shipment's trade direction, as for a row typed in.
        const values: NewInvoiceSellingCostRecord[] = selling.rows.map((row, i) => ({ ...row, ...from, sortOrder: selling.next + i }));
        await tx.insert(invoiceSellingCostTable).values(values);
      }
      // One settings row per (company, shipment).
      await tx
        .insert(billingSettingsTable)
        .values({ companyId, shipmentId, quoteRef: quoteNumber, ...(billingCurrency ? { billingCurrency } : {}) })
        .onConflictDoUpdate({
          target: [billingSettingsTable.companyId, billingSettingsTable.shipmentId],
          set: { quoteRef: quoteNumber, updatedAt: new Date(), deletedAt: null },
        });
      return { buying: buying?.rows.length ?? 0, selling: selling?.rows.length ?? 0, ...(alreadyCopied.length > 0 && { alreadyCopied }) };
    });
  }

  /**
   * Retires the buying lines earlier copies left on a shipment, before a new copy lands. A line
   * with nothing of the user's on it - no real cost, no invoice, not received - goes; one that has
   * them stays as a line of its own with the quote's estimate taken off it, so what was typed on
   * it is kept and the estimate is the new copy's alone. Trucking's own lines are not touched.
   */
  private async retireBuyingQuoteRows(tx: ImportTransaction, companyId: string, shipmentId: string): Promise<void> {
    const c = invoiceCostTable;
    const now = new Date();
    const quoteRows = [eq(c.companyId, companyId), eq(c.shipmentId, shipmentId), isNull(c.deletedAt), isNull(c.sourceTruckingRef), sql`${c.sourceQuoteNumber} <> ''`];
    await tx
      .update(c)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(...quoteRows, isNull(c.realAmount), eq(c.invoiceNumber, ""), eq(c.received, false)));
    await tx
      .update(c)
      .set({ sourceQuoteNumber: "", estQty: null, estAmount: null, updatedAt: now })
      .where(and(...quoteRows));
  }

  /**
   * A shipment now priced from a quote carries only the real part of its master job's shares (as a
   * re-split writes them): their estimates go, and a share with nothing but an estimate goes with it.
   * What it sold on at that estimate (a demurrage selling row) goes too, as processing the split
   * would take it: no cost is left behind it. A row on an issued invoice stays, under the lock an
   * invoice issue takes.
   */
  private async dropSplitEstimates(tx: ImportTransaction, companyId: string, shipmentId: string): Promise<void> {
    const c = invoiceCostTable;
    const now = new Date();
    const splitRows = [eq(c.companyId, companyId), eq(c.shipmentId, shipmentId), isNull(c.deletedAt), isNotNull(c.sourceMasterJobRef)];
    const dropped = await tx
      .update(c)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(...splitRows, isNull(c.realAmount)))
      .returning({ ref: c.sourceMasterJobRef });
    await tx.update(c).set({ estQty: null, estAmount: null, updatedAt: now }).where(and(...splitRows));
    const refs = dropped.flatMap((d) => (d.ref ? [d.ref] : []));
    if (!refs.length) return;
    await truckingLinesLock(tx, shipmentId);
    const s = invoiceSellingCostTable;
    const sold = await tx
      .select({ id: s.id })
      .from(s)
      .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt), inArray(s.sourceMasterJobRef, refs)));
    const invoiced = await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx);
    const remove = sold.map((r) => r.id).filter((id) => !invoiced.has(id));
    if (!remove.length) return;
    await tx.update(s).set({ deletedAt: now, updatedAt: now }).where(and(eq(s.companyId, companyId), inArray(s.id, remove)));
    // A row that went has nothing left to approve.
    await sellingAmountRequestRepository.withdrawFor(tx, companyId, remove);
  }

  // How one side of a shipment's Costs Breakdown stands: how many of its rows came from the
  // quote, how many from any quote, and the sort order the next row gets - one more than the last.
  private async sideOf(
    tx: ImportTransaction,
    table: CostTable,
    companyId: string,
    shipmentId: string,
    quoteNumber: string,
  ): Promise<{ copied: number; quoted: number; next: number }> {
    const [found] = await tx
      .select({
        copied: sql<string>`count(*) filter (where ${table.sourceQuoteNumber} = ${quoteNumber})`,
        quoted: sql<string>`count(*) filter (where ${table.sourceQuoteNumber} <> '')`,
        last: max(table.sortOrder),
      })
      .from(table as PgTable)
      .where(and(eq(table.companyId, companyId), eq(table.shipmentId, shipmentId), isNull(table.deletedAt)));
    return { copied: Number(found?.copied ?? 0), quoted: Number(found?.quoted ?? 0), next: found?.last == null ? 0 : found.last + 1 };
  }
}

export const quoteCostImportRepository = new QuoteCostImportRepository();
