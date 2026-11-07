import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, timestamp, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export type SellingAmountRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

// A request to sell a cost a shipment sells on at cost (a master job's demurrage) for less than it
// costs: asked from the shipment's Costs Breakdown with a reason, answered by a manager on Sales →
// Managers → Quote inquiries. The selling row changes only on an approval. A row is never written
// over - a new request is a new row - so every ask and answer stays on record.
export const sellingAmountRequestTable = pgTable(
  "selling_amount_request",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    // The job as it was named when asked: the managers' list reads it without asking Shipments.
    jobNumber: text("job_number").notNull().default(""),
    sellingCostId: uuid("selling_cost_id").notNull(),
    category: text("category").notNull().default(""),
    currency: text("currency").notNull(),
    // What the shipment's share cost, what it sold at, and what is asked, when asked.
    costAmount: numeric("cost_amount", { precision: 14, scale: 2 }).notNull(),
    currentAmount: numeric("current_amount", { precision: 14, scale: 2 }),
    requestedAmount: numeric("requested_amount", { precision: 14, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<SellingAmountRequestStatus>().notNull().default("pending"),
    requestedById: uuid("requested_by_id").notNull(),
    // Who asked and who answered (or took it back) by e-mail as recorded then: they stay named when they leave.
    requestedByName: text("requested_by_name").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedById: uuid("decided_by_id"),
    decidedByName: text("decided_by_name").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: text("comment").notNull().default(""),
    // The manager who answered is the one who asked (allowed and shown, as on a quote's margin).
    selfDecision: boolean("self_decision").notNull().default(false),
    // When the one who asked opened the answer in the bell.
    answerSeenAt: timestamp("answer_seen_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("selling_amount_request", table),
    tenantIndex("selling_amount_request", table),
    index("selling_amount_request_company_status_idx").on(table.companyId, table.status, table.requestedAt),
    index("selling_amount_request_company_shipment_idx").on(table.companyId, table.shipmentId),
    // One request waits per selling row; a second one is refused until it is answered.
    uniqueIndex("selling_amount_request_pending_unique").on(table.sellingCostId).where(sql`status = 'pending' AND deleted_at IS NULL`),
    check("selling_amount_request_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected', 'withdrawn')`),
  ],
);

export type SellingAmountRequestRecord = typeof sellingAmountRequestTable.$inferSelect;
export type NewSellingAmountRequestRecord = typeof sellingAmountRequestTable.$inferInsert;
