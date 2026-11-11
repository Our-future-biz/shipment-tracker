import { quoteReferenceNow } from "../../../lib/quoteReferenceNow";
import { plainSalesReference } from "../../../lib/salesReference";
import { plainSalesReferenceSql } from "../../../lib/db/salesReferenceSql";
import { Subscription } from "encore.dev/pubsub";
import { and, eq, ne, sql } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { billingSettingsTable } from "../schemas/billingSettings.schema";
import { invoiceCostTable } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable } from "../schemas/invoiceSellingCost.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): a job's billing settings
// and the costs copied from that quote name it as it is now.
export const invoicingQuoteRenamed = new Subscription(quoteRenamed, "invoicing-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    // The event says which quote; what its copies say comes from Sales now (lib/quoteReferenceNow),
    // and every copy of it is found without the Freight Mode letters, whatever spelling it holds.
    const now = await quoteReferenceNow(companyId, from, to);
    await db.transaction(async (tx) => {
      await tx
        .update(billingSettingsTable)
        .set({ quoteRef: now })
        .where(and(eq(billingSettingsTable.companyId, companyId), sql`${plainSalesReferenceSql(billingSettingsTable.quoteRef)} = ${plainSalesReference(from)}`, ne(billingSettingsTable.quoteRef, now)));
      await tx
        .update(invoiceCostTable)
        .set({ sourceQuoteNumber: now })
        .where(and(eq(invoiceCostTable.companyId, companyId), sql`${plainSalesReferenceSql(invoiceCostTable.sourceQuoteNumber)} = ${plainSalesReference(from)}`, ne(invoiceCostTable.sourceQuoteNumber, now)));
      await tx
        .update(invoiceSellingCostTable)
        .set({ sourceQuoteNumber: now })
        .where(and(eq(invoiceSellingCostTable.companyId, companyId), sql`${plainSalesReferenceSql(invoiceSellingCostTable.sourceQuoteNumber)} = ${plainSalesReference(from)}`, ne(invoiceSellingCostTable.sourceQuoteNumber, now)));
    });
  },
});
