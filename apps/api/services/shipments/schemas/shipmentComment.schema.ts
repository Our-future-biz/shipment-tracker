import { sql } from "drizzle-orm";
import { pgTable, text, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

export const shipmentCommentTable = pgTable(
  "shipment_comment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull(),
    message: text("message").notNull(),
    /** Colleagues tagged with @ in the message; each gets a notification until they open the chat. */
    mentionedUserIds: uuid("mentioned_user_ids").array().notNull().default(sql`'{}'::uuid[]`),
  },
  (table) => [
    ...defaultTableIndexes("shipment_comment", table),
    tenantIndex("shipment_comment", table),
    index("shipment_comment_shipment_id_idx").on(table.shipmentId),
    // "Messages that tag me" (polled by every signed-in page): mentioned_user_ids @> '{me}'.
    index("shipment_comment_mentioned_user_ids_idx").using("gin", table.mentionedUserIds),
  ],
);

export type ShipmentCommentRecord = typeof shipmentCommentTable.$inferSelect;
export type NewShipmentCommentRecord = typeof shipmentCommentTable.$inferInsert;
