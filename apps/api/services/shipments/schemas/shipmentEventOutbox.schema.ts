import { sql } from "drizzle-orm";
import { pgTable, uuid, jsonb, index, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { outboxColumns, outboxStatusCheck } from "../../../lib/outbox/outbox.columns";
import { shipmentTable } from "./shipment.schema";
import type { ShipmentDeletedEvent } from "../topics";

// One `shipment-deleted` event owed by a shipment's delete. Written in the delete's own transaction
// and published after the commit (straight away, then by the shipments-event-outbox cron with
// retries), so a delete that rolls back never publishes and a committed one is never lost: the
// services that keep rows for the shipment (invoicing, trucking, warehouse, fx) always hear of it.
export const shipmentEventOutboxTable = pgTable(
  "shipment_event_outbox",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    // Exactly the event to publish.
    event: jsonb("event").$type<ShipmentDeletedEvent>().notNull(),
    // Acting user, status, attempts, next try, claim and last error (shared with other outboxes).
    ...outboxColumns,
  },
  (table) => [
    ...defaultTableIndexes("shipment_event_outbox", table),
    tenantIndex("shipment_event_outbox", table),
    index("shipment_event_outbox_due_idx").on(table.nextAttemptAt).where(sql`status = 'pending'`),
    index("shipment_event_outbox_shipment_idx").on(table.shipmentId, table.createdAt),
    foreignKey({ name: "shipment_event_outbox_shipment_fk", columns: [table.shipmentId], foreignColumns: [shipmentTable.id] }).onDelete("cascade"),
    outboxStatusCheck("shipment_event_outbox_status_check", table),
  ],
);

export type ShipmentEventOutboxRecord = typeof shipmentEventOutboxTable.$inferSelect;
export type NewShipmentEventOutboxRecord = typeof shipmentEventOutboxTable.$inferInsert;
