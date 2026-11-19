import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

/** closed: the job was released another way - while the request still waited (nobody answered it), or before its approval was used. */
export type ShipmentReleaseRequestStatus = "pending" | "approved" | "rejected" | "closed";
/** Why a request was closed: the job was released another way, or somebody withdrew it (the asker a request still waiting, a manager an approval nobody used). */
export type ShipmentReleaseRequestClosedWhy = "released" | "withdrawn";
/** What is asked to be released: the House BoL, or the cargo from the warehouse (Warehouse Released). */
export type ShipmentReleaseRequestWhat = "house_bol" | "warehouse";

// A user asking a manager to release a job the prepayment stop holds (lib/prepaymentStop; Council Outlay 11,
// D16): the House BoL, or Warehouse Released. A manager - never the one who asked - approves or rejects on
// Shipments → Managers (its Approvals tab), each with a reason; the answer reaches whoever asked. Approving
// releases nothing: the approved request is a pass (lib/releaseRequest) for that job and that release, used once,
// in the write turn of the release it lets through - which records it as the override it is. A request still
// waiting when the job is released another way is closed, and so is an approval nobody used (it keeps who
// approved it, and why). Whoever asked may withdraw a request still waiting, and a manager an approval nobody used:
// closed too, as withdrawn, with who and why. As a Customs Office request, a row is never written
// over: a new request is a new row. At most one waits per shipment and thing asked.
export const shipmentReleaseRequestTable = pgTable(
  "shipment_release_request",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    what: text("what").$type<ShipmentReleaseRequestWhat>().notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<ShipmentReleaseRequestStatus>().notNull().default("pending"),
    // Who asked and who answered as named then: they stay named when they leave.
    requestedById: uuid("requested_by_id").notNull(),
    requestedByName: text("requested_by_name").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedById: uuid("decided_by_id"),
    decidedByName: text("decided_by_name").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // The manager's reason, required either way: why not (rejected), or why all the same (approved - it becomes
    // part of the override's reason). Kept when the request is closed afterwards: the closing has fields of its own.
    comment: text("comment").notNull().default(""),
    // When the one who asked opened the answer under the bell.
    answerSeenAt: timestamp("answer_seen_at", { withTimezone: true }),
    // An approved request is used once: when, and by whom (the one releasing, by e-mail as a stamp names people).
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedById: uuid("used_by_id"),
    usedByName: text("used_by_name").notNull().default(""),
    // A closed request: when, why (released another way, or withdrawn), and - withdrawn - by whom, as named
    // then, with their reason. Released another way, nobody closed it: no name, no reason.
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedWhy: text("closed_why").$type<ShipmentReleaseRequestClosedWhy>(),
    closedById: uuid("closed_by_id"),
    closedByName: text("closed_by_name").notNull().default(""),
    closeReason: text("close_reason").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("shipment_release_request", table),
    tenantIndex("shipment_release_request", table),
    index("shipment_release_request_shipment_id_idx").on(table.shipmentId),
    index("shipment_release_request_requested_by_idx").on(table.companyId, table.requestedById),
    uniqueIndex("shipment_release_request_one_pending_unique")
      .on(table.companyId, table.shipmentId, table.what)
      .where(sql`status = 'pending' AND deleted_at IS NULL`),
    foreignKey({ name: "shipment_release_request_shipment_fk", columns: [table.shipmentId], foreignColumns: [shipmentTable.id] }).onDelete("cascade"),
    check("shipment_release_request_what_check", sql`${table.what} IN ('house_bol', 'warehouse')`),
    check("shipment_release_request_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected', 'closed')`),
    check("shipment_release_request_closed_why_check", sql`${table.closedWhy} IS NULL OR ${table.closedWhy} IN ('released', 'withdrawn')`),
  ],
);

export type ShipmentReleaseRequestRecord = typeof shipmentReleaseRequestTable.$inferSelect;
export type NewShipmentReleaseRequestRecord = typeof shipmentReleaseRequestTable.$inferInsert;
