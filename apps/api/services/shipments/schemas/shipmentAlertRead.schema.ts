import { pgTable, timestamp, uuid, index, unique } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

// When each user last opened the Alerts of a shipment; an alert that came later counts as new.
export const shipmentAlertReadTable = pgTable(
  "shipment_alert_read",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    ...defaultTableIndexes("shipment_alert_read", table),
    tenantIndex("shipment_alert_read", table),
    index("shipment_alert_read_user_idx").on(table.userId),
    unique("shipment_alert_read_user_shipment_uq").on(table.userId, table.shipmentId),
  ],
);

export type ShipmentAlertReadRecord = typeof shipmentAlertReadTable.$inferSelect;
