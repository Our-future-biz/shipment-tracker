import { sql } from "drizzle-orm";
import { pgTable, text, uuid, jsonb, index, foreignKey, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { outboxColumns, outboxStatusCheck } from "../../../lib/outbox/outbox.columns";
import { gateMovementTable } from "./gateMovement.schema";

/** What a gate stamp writes to its shipment: the received or released date, or a plate added later. */
export type OutboxKind = "received" | "released" | "plate";
export type { OutboxStatus } from "../../../lib/outbox/outbox.columns";

// One shipment update owed by a gate stamp. It is written in the same transaction as the stamp
// and delivered afterwards (straight away, then by the warehouse-shipment-outbox cron with
// retries), as the user who stamped — so a stamp never loses its write-back when Shipments is
// briefly unavailable.
export const shipmentOutboxTable = pgTable(
  "warehouse_shipment_outbox",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    movementId: uuid("movement_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    kind: text("kind").$type<OutboxKind>().notNull(),
    // The gate stamp column this update comes from (gateIn | impRelease | gateOut), so a voided
    // stamp can cancel what it still owes.
    stamp: text("stamp").notNull().default(""),
    // Exactly the ShipmentUpdate fields to send (besides shipmentId).
    payload: jsonb("payload").$type<Record<string, string>>().notNull(),
    // Acting user, status, attempts, next try, claim and last error (shared with other outboxes).
    ...outboxColumns,
  },
  (table) => [
    ...defaultTableIndexes("warehouse_shipment_outbox", table),
    tenantIndex("warehouse_shipment_outbox", table),
    index("warehouse_shipment_outbox_due_idx").on(table.nextAttemptAt).where(sql`status = 'pending'`),
    index("warehouse_shipment_outbox_shipment_idx").on(table.shipmentId, table.createdAt).where(sql`status = 'pending'`),
    index("warehouse_shipment_outbox_movement_idx").on(table.movementId),
    foreignKey({ name: "wh_outbox_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    index("wh_outbox_movement_idx").on(table.movementId),
    check("wh_outbox_kind_check", sql`${table.kind} IN ('received', 'released', 'plate')`),
    outboxStatusCheck("wh_outbox_status_check", table),
  ],
);

export type ShipmentOutboxRecord = typeof shipmentOutboxTable.$inferSelect;
export type NewShipmentOutboxRecord = typeof shipmentOutboxTable.$inferInsert;
