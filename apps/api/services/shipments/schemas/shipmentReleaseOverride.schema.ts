import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { OverrideInvoice, ReleaseKind } from "../lib/prepaymentStop";
import { shipmentTable } from "./shipment.schema";

// A manager's release of a job on prepayment that was not paid (Accounts Receivable step 7, D20): the House BoL
// released, or Warehouse Released set from empty, with the reason and the invoices left to pay as they were then.
// Written in the same transaction as the release (lib/prepaymentStop). `checked` is false when Invoicing could not be
// asked whether the job was paid: the manager released it unchecked.
export const shipmentReleaseOverrideTable = pgTable(
  "shipment_release_override",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    kind: text("kind").$type<ReleaseKind>().notNull(),
    reason: text("reason").notNull(),
    invoices: jsonb("invoices").$type<OverrideInvoice[]>().notNull().default(sql`'[]'::jsonb`),
    checked: boolean("checked").notNull(),
    byUserId: uuid("by_user_id").notNull(),
    by: text("by").notNull().default(""),
  },
  (table) => [
    tenantIndex("shipment_release_override", table),
    index("shipment_release_override_shipment_idx").on(table.shipmentId, table.createdAt),
    foreignKey({ name: "shipment_release_override_shipment_fk", columns: [table.shipmentId], foreignColumns: [shipmentTable.id] }).onDelete("cascade"),
    check("shipment_release_override_kind_check", sql`${table.kind} IN ('house_bol', 'warehouse_released')`),
  ],
);

export type ShipmentReleaseOverrideRecord = typeof shipmentReleaseOverrideTable.$inferSelect;
export type NewShipmentReleaseOverrideRecord = typeof shipmentReleaseOverrideTable.$inferInsert;
