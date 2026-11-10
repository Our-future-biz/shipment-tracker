import { Subscription } from "encore.dev/pubsub";
import { and, eq } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { truckingConsignmentTable } from "../schemas/truckingConsignment.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): the trucking jobs made
// from that quote name it as it is now.
export const truckingQuoteRenamed = new Subscription(quoteRenamed, "trucking-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    await db
      .update(truckingConsignmentTable)
      .set({ quoteNumber: to })
      .where(and(eq(truckingConsignmentTable.companyId, companyId), eq(truckingConsignmentTable.quoteNumber, from)));
  },
});
