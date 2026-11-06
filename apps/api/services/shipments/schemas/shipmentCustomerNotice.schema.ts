import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

// What the customer was told about a shipment and when: the message goes out from the user's own
// mail program or by phone, so this is their word that it did, with a copy of the dates told. A
// date that later moves away from what was told is what "Not told" under the bell is about.
export const shipmentCustomerNoticeTable = pgTable(
  "shipment_customer_notice",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    kind: text("kind").notNull(),
    channel: text("channel").notNull().default("email"),
    toldTo: text("told_to").notNull().default(""),
    subject: text("subject").notNull().default(""),
    note: text("note").notNull().default(""),
    etaPod: date("eta_pod", { mode: "string" }),
    etaWarehouse: date("eta_warehouse", { mode: "string" }),
    plannedDelivery: date("planned_delivery", { mode: "string" }),
    toldById: uuid("told_by_id"),
  },
  (table) => [
    tenantIndex("shipment_customer_notice", table),
    foreignKey({ name: "shipment_customer_notice_shipment_fk", columns: [table.shipmentId], foreignColumns: [shipmentTable.id] }).onDelete("cascade"),
    index("shipment_customer_notice_shipment_idx").on(table.shipmentId, table.createdAt),
    check("shipment_customer_notice_kind_check", sql`${table.kind} IN ('status', 'arrival_notice', 'eta_change', 'delivery_advice', 'pod_sent', 'draft_sent', 'bl_provided')`),
    check("shipment_customer_notice_channel_check", sql`${table.channel} IN ('email', 'phone', 'other')`),
  ],
);

export type ShipmentCustomerNoticeRecord = typeof shipmentCustomerNoticeTable.$inferSelect;
export type NewShipmentCustomerNoticeRecord = typeof shipmentCustomerNoticeTable.$inferInsert;
