import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

// A dated fact about a shipment that its own columns can't hold: with a place, a container, a time
// and where it came from. The shipment's dates stay on the shipment; an event that sets one says so
// in effect_field (lib/trackingEvents has the rule of who may set what).
export const shipmentTrackingEventTable = pgTable(
  "shipment_tracking_event",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    // "" = the shipment as a whole.
    containerNumber: text("container_number").notNull().default(""),
    kind: text("kind").notNull(),
    // The calendar day it happened: what a shipment date takes.
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    // The moment, when known.
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    place: text("place").notNull().default(""),
    locode: text("locode").notNull().default(""),
    vessel: text("vessel").notNull().default(""),
    voyage: text("voyage").notNull().default(""),
    source: text("source").notNull().default("user"),
    // The source's own id of the event, so a replay inserts nothing; "" for what people record.
    externalId: text("external_id").notNull().default(""),
    recordedById: uuid("recorded_by_id"),
    note: text("note").notNull().default(""),
    payload: jsonb("payload"),
    effect: text("effect").notNull().default("none"),
    effectField: text("effect_field").notNull().default(""),
    effectValue: date("effect_value", { mode: "string" }),
    decidedById: uuid("decided_by_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // An exception (delayed, rolled, hold) is open until a later event or a person closes it.
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedById: uuid("resolved_by_id"),
  },
  (table) => [
    tenantIndex("shipment_tracking_event", table),
    foreignKey({ name: "shipment_tracking_event_shipment_fk", columns: [table.shipmentId], foreignColumns: [shipmentTable.id] }).onDelete("cascade"),
    index("shipment_tracking_event_shipment_idx").on(table.shipmentId, table.occurredOn),
    index("shipment_tracking_event_proposed_idx").on(table.companyId, table.effect).where(sql`effect = 'proposed'`),
    uniqueIndex("shipment_tracking_event_external_uq")
      .on(table.companyId, table.shipmentId, table.source, table.externalId)
      .where(sql`external_id <> '' AND deleted_at IS NULL`),
    check("shipment_tracking_event_source_check", sql`${table.source} IN ('user', 'master_job', 'warehouse', 'trucking', 'customs', 'document', 'carrier', 'system')`),
    check("shipment_tracking_event_effect_check", sql`${table.effect} IN ('none', 'proposed', 'applied', 'dismissed')`),
  ],
);

export type ShipmentTrackingEventRecord = typeof shipmentTrackingEventTable.$inferSelect;
export type NewShipmentTrackingEventRecord = typeof shipmentTrackingEventTable.$inferInsert;
