import { and, eq, max, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { billingSettingsTable } from "../schemas/billingSettings.schema";
import { invoiceCostTable } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable } from "../schemas/invoiceSellingCost.schema";
import type { QuoteBuyingRow, QuoteSellingRow } from "../utils/quoteCostImport.utils";

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
   * Null, with nothing written, when a side that is asked for already holds rows of that quote
   * and `again` is not set. An advisory lock on the shipment makes that check hold for two
   * copies started at the same moment: the second waits and then finds the rows of the first.
   */
  async copy(
    companyId: string,
    shipmentId: string,
    quoteNumber: string,
    rows: { buying?: QuoteBuyingRow[]; selling?: QuoteSellingRow[] },
    again: boolean,
  ): Promise<{ buying: number; selling: number } | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`import-quote:${shipmentId}`}))`);

      const side = (table: CostTable) => this.sideOf(tx, table, companyId, shipmentId, quoteNumber);
      const buying = rows.buying && { rows: rows.buying, ...(await side(invoiceCostTable)) };
      const selling = rows.selling && { rows: rows.selling, ...(await side(invoiceSellingCostTable)) };
      if (!again && (buying?.copied || selling?.copied)) return null;

      const from = { companyId, shipmentId, sourceQuoteNumber: quoteNumber };
      if (buying?.rows.length) {
        await tx.insert(invoiceCostTable).values(buying.rows.map((row, i) => ({ ...row, ...from, sortOrder: buying.next + i })));
      }
      if (selling?.rows.length) {
        await tx.insert(invoiceSellingCostTable).values(selling.rows.map((row, i) => ({ ...row, ...from, sortOrder: selling.next + i })));
      }
      // One settings row per shipment (unique shipment_id). A row of another company under that
      // id is none of the caller's business and stays as it is.
      await tx
        .insert(billingSettingsTable)
        .values({ companyId, shipmentId, quoteRef: quoteNumber })
        .onConflictDoUpdate({
          target: billingSettingsTable.shipmentId,
          set: { quoteRef: quoteNumber, updatedAt: new Date() },
          setWhere: eq(billingSettingsTable.companyId, companyId),
        });
      return { buying: buying?.rows.length ?? 0, selling: selling?.rows.length ?? 0 };
    });
  }

  // How one side of a shipment's Costs Breakdown stands: how many of its rows came from the
  // quote, and the sort order the next row gets - one more than the last.
  private async sideOf(
    tx: ImportTransaction,
    table: CostTable,
    companyId: string,
    shipmentId: string,
    quoteNumber: string,
  ): Promise<{ copied: number; next: number }> {
    const [found] = await tx
      .select({
        copied: sql<string>`count(*) filter (where ${table.sourceQuoteNumber} = ${quoteNumber})`,
        last: max(table.sortOrder),
      })
      .from(table as PgTable)
      .where(and(eq(table.companyId, companyId), eq(table.shipmentId, shipmentId)));
    return { copied: Number(found?.copied ?? 0), next: found?.last == null ? 0 : found.last + 1 };
  }
}

export const quoteCostImportRepository = new QuoteCostImportRepository();
