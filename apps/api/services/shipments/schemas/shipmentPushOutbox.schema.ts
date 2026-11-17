import { sql } from "drizzle-orm";
import { pgTable, uuid, jsonb, text, index, foreignKey, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { outboxColumns, outboxStatusCheck } from "../../../lib/outbox/outbox.columns";
import type { PushTarget, ShipmentChanges } from "../../../lib/shipmentPush";
import { shipmentTable } from "./shipment.schema";

// A person's change of a shipment owed to the copies another module keeps of it (lib/shipmentPush):
// Trucking's jobs or the warehouse gate records. Written in the shipment write's own turn and sent
// after the commit (straight away, then by the shipments-push-outbox cron with retries) as the user
// who made the change, so a change is never lost and a rolled-back write sends nothing.
export const shipmentPushOutboxTable = pgTable(
  "shipment_push_outbox",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    target: text("target").$type<PushTarget>().notNull(),
    // The fields changed, each from what to what: the other side takes a change only while it still holds `from`.
    changes: jsonb("changes").$type<ShipmentChanges>().notNull(),
    // Acting user, status, attempts, next try, claim and last error (shared with other outboxes).
    ...outboxColumns,
  },
  (table) => [
    ...defaultTableIndexes("shipment_push_outbox", table),
    tenantIndex("shipment_push_outbox", table),
    index("shipment_push_outbox_due_idx").on(table.nextAttemptAt).where(sql`status = 'pending'`),
    index("shipment_push_outbox_shipment_idx").on(table.shipmentId, table.createdAt),
    foreignKey({ name: "shipment_push_outbox_shipment_fk", columns: [table.shipmentId], foreignColumns: [shipmentTable.id] }).onDelete("cascade"),
    check("shipment_push_outbox_target_check", sql`${table.target} IN ('trucking', 'warehouse')`),
    outboxStatusCheck("shipment_push_outbox_status_check", table),
  ],
);

export type ShipmentPushOutboxRecord = typeof shipmentPushOutboxTable.$inferSelect;
export type NewShipmentPushOutboxRecord = typeof shipmentPushOutboxTable.$inferInsert;
