import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp } from "drizzle-orm/pg-core";

/**
 * Since when this system notes that an approved haulier invoice was paid (Council Review 5, K2): the moment
 * the migration that made it ran, one row. An invoice approved before then may have been paid without a word
 * here, so What we owe lists it apart instead of counting it. Nothing on the invoices is changed for it.
 */
export const truckingPaymentTrackingTable = pgTable(
  "trucking_payment_tracking",
  {
    id: integer("id").primaryKey().default(1),
    since: timestamp("since", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("trucking_payment_tracking_one_row", sql`${table.id} = 1`)],
);

export type TruckingPaymentTrackingRecord = typeof truckingPaymentTrackingTable.$inferSelect;
