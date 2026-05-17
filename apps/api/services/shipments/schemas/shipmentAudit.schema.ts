import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";

export const shipmentAuditTable = pgTable(
  "shipment_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id").notNull(),
    userId: uuid("user_id").notNull(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shipment_audit_shipment_id_idx").on(table.shipmentId),
    index("shipment_audit_changed_at_idx").on(table.changedAt),
  ],
);

export type ShipmentAuditRecord = typeof shipmentAuditTable.$inferSelect;
export type NewShipmentAuditRecord = typeof shipmentAuditTable.$inferInsert;
