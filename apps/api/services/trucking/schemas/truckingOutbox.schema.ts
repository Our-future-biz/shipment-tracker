import { sql } from "drizzle-orm";
import { pgTable, text, uuid, jsonb, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { outboxColumns, outboxStatusCheck } from "../../../lib/outbox/outbox.columns";

/**
 * What a row owes the job:
 *  - planned: pick-up date, planned delivery date and plate written to the shipment (ShipmentUpdate)
 *  - plate: the tractor plate typed later (ShipmentUpdate)
 *  - delivered: the shipment's actual delivery date (ShipmentUpdate)
 *  - billing: every consignment of the job has POD - the shipment goes to "Billing"
 *  - costs: the Trucking lines of the job's Costs Breakdown (replaced by sourceRef in invoicing)
 *  - expect_arrival / expect_departure: an LTL trip announced to our warehouse (lib/warehouseLink)
 *  - cancel_expected: that announcement withdrawn (the job left the trip, or the trip was cancelled)
 */
export type TruckingOutboxKind = "planned" | "plate" | "delivered" | "billing" | "costs" | "expect_arrival" | "expect_departure" | "cancel_expected";
export type { OutboxStatus } from "../../../lib/outbox/outbox.columns";

// One update owed to the consignment's job (Shipments) or its Costs Breakdown (Invoicing). It is
// written in the same transaction as the change that causes it and delivered afterwards (straight
// away, then by the trucking-shipment-outbox cron with retries) as the user who caused it, so a
// change never loses its write-back when the other service is briefly unavailable. Rows of one
// shipment go out in the order they were made.
export const truckingOutboxTable = pgTable(
  "trucking_outbox",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    consignmentId: uuid("consignment_id").notNull(),
    shipmentId: uuid("shipment_id").notNull(),
    kind: text("kind").$type<TruckingOutboxKind>().notNull(),
    // ShipmentUpdate fields (planned / plate / delivered), nothing (billing) or the cost lines (costs).
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    ...outboxColumns,
  },
  (table) => [
    ...defaultTableIndexes("trucking_outbox", table),
    tenantIndex("trucking_outbox", table),
    index("trucking_outbox_due_idx").on(table.nextAttemptAt).where(sql`status = 'pending'`),
    index("trucking_outbox_shipment_idx").on(table.shipmentId, table.createdAt).where(sql`status = 'pending'`),
    index("trucking_outbox_consignment_idx").on(table.consignmentId),
    check("trucking_outbox_kind_check", sql`${table.kind} IN ('planned', 'plate', 'delivered', 'billing', 'costs', 'expect_arrival', 'expect_departure', 'cancel_expected')`),
    outboxStatusCheck("trucking_outbox_status_check", table),
  ],
);

export type TruckingOutboxRecord = typeof truckingOutboxTable.$inferSelect;
export type NewTruckingOutboxRecord = typeof truckingOutboxTable.$inferInsert;
