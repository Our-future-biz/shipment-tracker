import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

// When each user last opened the Tracking tab of a shipment: what the bell says about its dates
// that came later is new to them. Apart from the Alerts tab's own read mark (shipment_alert_read).
export const shipmentTrackingReadTable = pgTable(
  "shipment_tracking_read",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantIndex("shipment_tracking_read", table),
    index("shipment_tracking_read_user_idx").on(table.userId),
    unique("shipment_tracking_read_user_shipment_uq").on(table.userId, table.shipmentId),
  ],
);
