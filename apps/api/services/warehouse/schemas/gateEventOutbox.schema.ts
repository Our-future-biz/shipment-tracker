import { sql } from "drizzle-orm";
import { pgTable, uuid, jsonb, index, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { outboxColumns, outboxStatusCheck } from "../../../lib/outbox/outbox.columns";
import { gateMovementTable } from "./gateMovement.schema";
import type { WarehouseGateStampedEvent } from "../topics";

// One `warehouse-gate-stamped` event owed by a gate stamp (or its void). Written in the stamp's
// own transaction and published after the commit (straight away, then by the
// warehouse-shipment-outbox cron with retries) — so a stamp that rolls back never publishes and
// a committed one is never lost. Events of one gate record go out in order (a gate-in before its void).
export const gateEventOutboxTable = pgTable(
  "warehouse_gate_event_outbox",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    movementId: uuid("movement_id").notNull(),
    // Exactly the event to publish.
    event: jsonb("event").$type<WarehouseGateStampedEvent>().notNull(),
    // Acting user, status, attempts, next try, claim and last error (shared with other outboxes).
    ...outboxColumns,
  },
  (table) => [
    ...defaultTableIndexes("warehouse_gate_event_outbox", table),
    tenantIndex("warehouse_gate_event_outbox", table),
    index("wh_gate_event_outbox_due_idx").on(table.nextAttemptAt).where(sql`status = 'pending'`),
    index("wh_gate_event_outbox_movement_idx").on(table.movementId, table.createdAt),
    foreignKey({ name: "wh_gate_event_outbox_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    outboxStatusCheck("wh_gate_event_outbox_status_check", table),
  ],
);

export type GateEventOutboxRecord = typeof gateEventOutboxTable.$inferSelect;
export type NewGateEventOutboxRecord = typeof gateEventOutboxTable.$inferInsert;
