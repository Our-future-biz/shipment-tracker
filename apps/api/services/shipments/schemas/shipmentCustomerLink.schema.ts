import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

// The read-only link a customer gets to one shipment (Council Outlay 8, D22). Only the SHA-256 of
// the token is stored, so a link can't be shown again: a new one replaces it. A shipment has at most
// one live link. How long it stays open follows the delivery date (lib/customerLink).
export const shipmentCustomerLinkTable = pgTable(
  "shipment_customer_link",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdById: uuid("created_by_id").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: uuid("revoked_by_id"),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  },
  (table) => [
    tenantIndex("shipment_customer_link", table),
    index("shipment_customer_link_shipment_idx").on(table.shipmentId),
    uniqueIndex("shipment_customer_link_token_uq").on(table.tokenHash),
    uniqueIndex("shipment_customer_link_live_uq").on(table.shipmentId).where(sql`revoked_at IS NULL AND deleted_at IS NULL`),
  ],
);

export type ShipmentCustomerLinkRecord = typeof shipmentCustomerLinkTable.$inferSelect;
export type NewShipmentCustomerLinkRecord = typeof shipmentCustomerLinkTable.$inferInsert;
