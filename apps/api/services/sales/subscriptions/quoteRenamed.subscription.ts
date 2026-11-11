import { quoteReferenceNow } from "../../../lib/quoteReferenceNow";
import { plainSalesReference } from "../../../lib/salesReference";
import { plainSalesReferenceSql } from "../../../lib/db/salesReferenceSql";
import { Subscription } from "encore.dev/pubsub";
import { and, eq, ne, sql } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { followupTaskTable } from "../schemas/followupTask.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): the follow-up tasks on
// that quote name it as it is now.
export const salesQuoteRenamed = new Subscription(quoteRenamed, "sales-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    // The event says which quote; what its copies say comes from Sales now (lib/quoteReferenceNow),
    // and every copy of it is found without the Freight Mode letters, whatever spelling it holds.
    const now = await quoteReferenceNow(companyId, from, to);
    await db
      .update(followupTaskTable)
      .set({ quoteNumber: now })
      .where(and(eq(followupTaskTable.companyId, companyId), sql`${plainSalesReferenceSql(followupTaskTable.quoteNumber)} = ${plainSalesReference(from)}`, ne(followupTaskTable.quoteNumber, now)));
  },
});
