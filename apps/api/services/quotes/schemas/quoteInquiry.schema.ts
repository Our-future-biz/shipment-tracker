import { sql } from "drizzle-orm";
import { pgTable, text, uuid, timestamp, jsonb, boolean, doublePrecision, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/**
 * What a quote inquiry asks: a margin below the floor, for a manager to approve (Council Outlay 6),
 * or pieces of 12.5 t or more, for the warehouse to price (its answer also stays on the quote, as
 * data.warehouseInquiry, which the send gate reads).
 */
export type QuoteInquiryKind = "margin" | "warehouse_heavy";
export type QuoteInquiryStatus = "pending" | "approved" | "rejected" | "withdrawn";
/** How a manager answered: approve as asked, approve down to a counter margin, or reject. */
export type QuoteInquiryDecision = "approve" | "counter" | "reject";

/** What a warehouse question is about, and the warehouse's price when it approved. */
export interface QuoteInquiryWarehouseDetails {
  pieces: number;
  grossWeightKg: number;
  priceEurPerPiece: number | null;
}

/** The quote's margin when the rep asked, as the gate judged it. */
export interface QuoteInquirySnapshot {
  sellingCzk: number;
  buyingCzk: number;
  marginCzk: number | null;
  marginPercent: number | null;
  floorPercent: number;
  floorMinCzk: number;
}

// One question to a manager about one quote: a rep asks for a margin below the floor to be
// approved, or the warehouse to price heavy pieces; a manager answers. A row is never written over -
// a new question is a new row - so every ask and answer stays on record. At most one question of a
// kind waits per quote.
export const quoteInquiryTable = pgTable(
  "quote_inquiry",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    quoteId: uuid("quote_id").notNull(),
    quoteNumber: text("quote_number").notNull(),
    kind: text("kind").$type<QuoteInquiryKind>().notNull(),
    status: text("status").$type<QuoteInquiryStatus>().notNull().default("pending"),
    requestedById: uuid("requested_by_id").notNull(),
    // Who asked and who answered (or took it back) by e-mail as recorded then: they stay named when they leave.
    requestedByName: text("requested_by_name").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    // Why the rep asks: one of the reasons offered (a margin question), and their own words.
    reason: text("reason").notNull().default(""),
    note: text("note").notNull().default(""),
    // When the customer needs the answer; null when not said.
    needsBy: timestamp("needs_by", { withTimezone: true }),
    competitorPrice: text("competitor_price").notNull().default(""),
    volume: text("volume").notNull().default(""),
    // A margin question: the quote's margin when asked. A warehouse question: its pieces, and the price.
    snapshot: jsonb("snapshot").$type<QuoteInquirySnapshot>(),
    details: jsonb("details").$type<QuoteInquiryWarehouseDetails>(),
    // The manager the quote's owner reports to when the rep asked (auth "Reports to"); null =
    // nobody set, so the company's admins are told.
    notifyUserId: uuid("notify_user_id"),
    decision: text("decision").$type<QuoteInquiryDecision>(),
    decidedById: uuid("decided_by_id"),
    decidedByName: text("decided_by_name").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // The margin the approval covers (that one or better); null for a rejection.
    approvedMarginCzk: doublePrecision("approved_margin_czk"),
    approvedMarginPercent: doublePrecision("approved_margin_percent"),
    comment: text("comment").notNull().default(""),
    // The manager who answered asked, or owns the quote (allowed and shown, owner decision D9).
    selfDecision: boolean("self_decision").notNull().default(false),
    // When the one who asked opened the answer in the bell.
    answerSeenAt: timestamp("answer_seen_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("quote_inquiry", table),
    tenantIndex("quote_inquiry", table),
    index("quote_inquiry_company_status_idx").on(table.companyId, table.status),
    index("quote_inquiry_company_requested_by_idx").on(table.companyId, table.requestedById),
    // A quote's questions (its page, every lock), and a kind's newest first (the lists).
    index("quote_inquiry_company_quote_idx").on(table.companyId, table.quoteId),
    index("quote_inquiry_company_kind_requested_idx").on(table.companyId, table.kind, table.requestedAt),
    // One question of a kind waits per quote; a second one is refused until it is answered.
    uniqueIndex("quote_inquiry_pending_unique").on(table.quoteId, table.kind).where(sql`status = 'pending' AND deleted_at IS NULL`),
    check("quote_inquiry_kind_check", sql`${table.kind} IN ('margin', 'warehouse_heavy')`),
    check("quote_inquiry_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected', 'withdrawn')`),
    check("quote_inquiry_decision_check", sql`${table.decision} IS NULL OR ${table.decision} IN ('approve', 'counter', 'reject')`),
  ],
);

export type QuoteInquiryRecord = typeof quoteInquiryTable.$inferSelect;
export type NewQuoteInquiryRecord = typeof quoteInquiryTable.$inferInsert;
