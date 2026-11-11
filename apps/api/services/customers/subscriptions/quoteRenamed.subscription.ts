import { quoteReferenceNow } from "../../../lib/quoteReferenceNow";
import { plainSalesReference } from "../../../lib/salesReference";
import { plainSalesReferenceSql } from "../../../lib/db/salesReferenceSql";
import { Subscription } from "encore.dev/pubsub";
import { and, eq, ne, sql } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { customerTable } from "../schemas/customer.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): a supplier waiting for
// approval from that quote names it as it is now.
export const customersQuoteRenamed = new Subscription(quoteRenamed, "customers-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    // The event says which quote; what its copies say comes from Sales now (lib/quoteReferenceNow),
    // and every copy of it is found without the Freight Mode letters, whatever spelling it holds.
    const now = await quoteReferenceNow(companyId, from, to);
    await db
      .update(customerTable)
      .set({ approvalQuoteNumber: now })
      .where(and(eq(customerTable.companyId, companyId), sql`${plainSalesReferenceSql(customerTable.approvalQuoteNumber)} = ${plainSalesReference(from)}`, ne(customerTable.approvalQuoteNumber, now)));
  },
});
