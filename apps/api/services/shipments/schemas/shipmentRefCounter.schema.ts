import { pgTable, uuid, text, bigint, timestamp, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// The last number handed out per company and sequence: "CZ" for shipment job numbers
// (CZ00000123), "MCZ" for master jobs (MCZ00000045). One row is bumped atomically per new
// shipment / master job inside the creating transaction, so two creates never get the same
// number. The counter never goes below the highest number already stored (live or archived),
// so a number is never reused.
export const shipmentRefCounterTable = pgTable(
  "shipment_ref_counter",
  {
    companyId: uuid("company_id").notNull(),
    sequence: text("sequence").notNull(),
    last: bigint("last", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.sequence] }),
    check("shipment_ref_counter_sequence_check", sql`${table.sequence} IN ('CZ', 'MCZ')`),
  ],
);

export type ShipmentRefSequence = "CZ" | "MCZ";
