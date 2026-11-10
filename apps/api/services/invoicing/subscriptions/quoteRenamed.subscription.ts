import { Subscription } from "encore.dev/pubsub";
import { and, eq } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { billingSettingsTable } from "../schemas/billingSettings.schema";
import { invoiceCostTable } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable } from "../schemas/invoiceSellingCost.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): a job's billing settings
// and the costs copied from that quote name it as it is now.
export const invoicingQuoteRenamed = new Subscription(quoteRenamed, "invoicing-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    await db.transaction(async (tx) => {
      await tx
        .update(billingSettingsTable)
        .set({ quoteRef: to })
        .where(and(eq(billingSettingsTable.companyId, companyId), eq(billingSettingsTable.quoteRef, from)));
      await tx
        .update(invoiceCostTable)
        .set({ sourceQuoteNumber: to })
        .where(and(eq(invoiceCostTable.companyId, companyId), eq(invoiceCostTable.sourceQuoteNumber, from)));
      await tx
        .update(invoiceSellingCostTable)
        .set({ sourceQuoteNumber: to })
        .where(and(eq(invoiceSellingCostTable.companyId, companyId), eq(invoiceSellingCostTable.sourceQuoteNumber, from)));
    });
  },
});
