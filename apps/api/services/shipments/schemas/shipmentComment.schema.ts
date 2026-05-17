import { pgTable, text, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const shipmentCommentTable = pgTable(
  "shipment_comment",
  {
    ...defaultTableColumns,
    shipmentId: uuid("shipment_id").notNull(),
    authorId: uuid("author_id").notNull(),
    message: text("message").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("shipment_comment", table),
    index("shipment_comment_shipment_id_idx").on(table.shipmentId),
  ],
);

export type ShipmentCommentRecord = typeof shipmentCommentTable.$inferSelect;
export type NewShipmentCommentRecord = typeof shipmentCommentTable.$inferInsert;
