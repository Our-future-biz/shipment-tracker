import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

export type CustomsOfficeRequestStatus = "pending" | "approved" | "rejected";

// A regular user asking for a shipment's chosen Customs Office to be changed: a manager approves
// (the new office then goes on the shipment) or rejects with a reason on the Warehouse Managers
// page, and the answer reaches whoever asked. A row is never written over - a new request is a new
// row - so every request and answer stays on record. At most one waits per shipment.
export const customsOfficeRequestTable = pgTable(
  "customs_office_request",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    // The office when asked, and the one asked for: code and name as one text, as on the shipment.
    fromOffice: text("from_office").notNull(),
    toOffice: text("to_office").notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<CustomsOfficeRequestStatus>().notNull().default("pending"),
    // Who asked and who answered as named then: they stay named when they leave.
    requestedById: uuid("requested_by_id").notNull(),
    requestedByName: text("requested_by_name").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedById: uuid("decided_by_id"),
    decidedByName: text("decided_by_name").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Rejected: why (required); approved: optional.
    comment: text("comment").notNull().default(""),
    // When the one who asked opened the answer under the bell.
    answerSeenAt: timestamp("answer_seen_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("customs_office_request", table),
    tenantIndex("customs_office_request", table),
    index("customs_office_request_shipment_id_idx").on(table.shipmentId),
    index("customs_office_request_requested_by_idx").on(table.companyId, table.requestedById),
    uniqueIndex("customs_office_request_one_pending_unique")
      .on(table.companyId, table.shipmentId)
      .where(sql`status = 'pending' AND deleted_at IS NULL`),
    check("customs_office_request_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
  ],
);

export type CustomsOfficeRequestRecord = typeof customsOfficeRequestTable.$inferSelect;
export type NewCustomsOfficeRequestRecord = typeof customsOfficeRequestTable.$inferInsert;
