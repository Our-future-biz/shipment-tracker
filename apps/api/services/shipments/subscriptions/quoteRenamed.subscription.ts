import { quoteReferenceNow } from "../../../lib/quoteReferenceNow";
import { plainSalesReference } from "../../../lib/salesReference";
import { plainSalesReferenceSql } from "../../../lib/db/salesReferenceSql";
import { Subscription } from "encore.dev/pubsub";
import { and, eq, ne, sql } from "drizzle-orm";
import { quoteRenamed } from "../../quotes/topics";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";

// A quote's reference took the letters of its Freight Mode (quotes/topics): the shipments that name it
// as their Sales Reference name it as it is now. The same quote, so no edit rule or history applies.
export const shipmentsQuoteRenamed = new Subscription(quoteRenamed, "shipments-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    // The event says which quote; what its copies say comes from Sales now (lib/quoteReferenceNow),
    // and every copy of it is found without the Freight Mode letters, whatever spelling it holds.
    const now = await quoteReferenceNow(companyId, from, to);
    await db
      .update(shipmentTable)
      .set({ salesNumber: now })
      .where(and(eq(shipmentTable.companyId, companyId), sql`${plainSalesReferenceSql(shipmentTable.salesNumber)} = ${plainSalesReference(from)}`, ne(shipmentTable.salesNumber, now)));
  },
});
