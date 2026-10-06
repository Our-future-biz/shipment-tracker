import { pgTable, timestamp, uuid, index, unique } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// How far each user has read the chat of a shipment; what came later counts as unread.
export const shipmentCommentReadTable = pgTable(
  "shipment_comment_read",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    userId: uuid("user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    ...defaultTableIndexes("shipment_comment_read", table),
    tenantIndex("shipment_comment_read", table),
    index("shipment_comment_read_user_idx").on(table.userId),
    unique("shipment_comment_read_user_shipment_uq").on(table.userId, table.shipmentId),
  ],
);

export type ShipmentCommentReadRecord = typeof shipmentCommentReadTable.$inferSelect;
