import { Subscription } from "encore.dev/pubsub";
import { and, eq } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { followupTaskTable } from "../schemas/followupTask.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): the follow-up tasks on
// that quote name it as it is now.
export const salesQuoteRenamed = new Subscription(quoteRenamed, "sales-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    await db
      .update(followupTaskTable)
      .set({ quoteNumber: to })
      .where(and(eq(followupTaskTable.companyId, companyId), eq(followupTaskTable.quoteNumber, from)));
  },
});
