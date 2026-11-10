import { Subscription } from "encore.dev/pubsub";
import { and, eq } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): the shipments that name it
// as their Sales Reference name it as it is now. The same quote, so no edit rule or history applies.
export const shipmentsQuoteRenamed = new Subscription(quoteRenamed, "shipments-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    await db
      .update(shipmentTable)
      .set({ salesNumber: to })
      .where(and(eq(shipmentTable.companyId, companyId), eq(shipmentTable.salesNumber, from)));
  },
});
