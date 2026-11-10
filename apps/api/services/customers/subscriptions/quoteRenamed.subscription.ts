import { Subscription } from "encore.dev/pubsub";
import { and, eq } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { customerTable } from "../schemas/customer.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): a supplier waiting for
// approval from that quote names it as it is now.
export const customersQuoteRenamed = new Subscription(quoteRenamed, "customers-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    await db
      .update(customerTable)
      .set({ approvalQuoteNumber: to })
      .where(and(eq(customerTable.companyId, companyId), eq(customerTable.approvalQuoteNumber, from)));
  },
});
