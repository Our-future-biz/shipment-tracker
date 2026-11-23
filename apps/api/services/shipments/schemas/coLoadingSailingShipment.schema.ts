import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// A shipment linked to a Co-Loading Concept sailing (its box), on the sailing's Linked shipments tab.
// A shipment is on one sailing at a time: removing it marks the row deleted, and it can then be linked
// again, to this sailing or another.
export const coLoadingSailingShipmentTable = pgTable(
  "co_loading_sailing_shipment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    sailingId: uuid("sailing_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    // Who linked it, as named then.
    createdById: uuid("created_by_id"),
    createdByName: text("created_by_name").notNull().default(""),
    // A link taken off (deleted_at set): who took it off, as named then, and why - "removed" by
    // hand, or "shipment_deleted" when the shipment itself was deleted. "" on a live link, and on
    // one taken off before this was recorded.
    removedById: uuid("removed_by_id"),
    removedByName: text("removed_by_name").notNull().default(""),
    removedReason: text("removed_reason").notNull().default(""),
    // A link taken off by "Move to another sailing" (removed_reason "moved"): where the shipment
    // went, and the reason typed for leaving it behind here (D17).
    movedToSailingId: uuid("moved_to_sailing_id"),
    removedNote: text("removed_note").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("co_loading_sailing_shipment", table),
    tenantIndex("co_loading_sailing_shipment", table),
    index("co_loading_sailing_shipment_sailing_idx").on(table.companyId, table.sailingId),
    // One live link per shipment: a shipment sits in one box at a time.
    uniqueIndex("co_loading_sailing_shipment_one_sailing").on(table.companyId, table.shipmentId).where(sql`deleted_at IS NULL`),
  ],
);

export type CoLoadingSailingShipmentRecord = typeof coLoadingSailingShipmentTable.$inferSelect;
