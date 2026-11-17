import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

// When each user last opened the Notes To-Do tab of a shipment: a shipment they were made the
// Handled By or Holiday Cover of before that is no longer news in the bell (lib/coverBell).
export const shipmentNotesReadTable = pgTable(
  "shipment_notes_read",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantIndex("shipment_notes_read", table),
    index("shipment_notes_read_user_idx").on(table.userId),
    unique("shipment_notes_read_user_shipment_uq").on(table.userId, table.shipmentId),
  ],
);
