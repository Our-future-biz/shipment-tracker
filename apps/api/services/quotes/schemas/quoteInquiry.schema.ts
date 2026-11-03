import { sql } from "drizzle-orm";
import { pgTable, text, uuid, timestamp, jsonb, boolean, doublePrecision, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/** What a quote inquiry asks: today a margin below the floor, for a manager to approve (Council Outlay 6). */
export type QuoteInquiryKind = "margin";
export type QuoteInquiryStatus = "pending" | "approved" | "rejected" | "withdrawn";
/** How a manager answered: approve as asked, approve down to a counter margin, or reject. */
export type QuoteInquiryDecision = "approve" | "counter" | "reject";

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
// approved, a manager answers. A row is never written over - a new question is a new row - so
// every ask and answer stays on record. At most one question of a kind waits per quote.
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
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    // Why the rep asks: one of the reasons offered, and their own words.
    reason: text("reason").notNull(),
    note: text("note").notNull().default(""),
    // When the customer needs the answer; null when not said.
    needsBy: timestamp("needs_by", { withTimezone: true }),
    competitorPrice: text("competitor_price").notNull().default(""),
    volume: text("volume").notNull().default(""),
    snapshot: jsonb("snapshot").$type<QuoteInquirySnapshot>().notNull(),
    // The manager the quote's owner reports to when the rep asked (auth "Reports to"); null =
    // nobody set, so the company's admins are told.
    notifyUserId: uuid("notify_user_id"),
    decision: text("decision").$type<QuoteInquiryDecision>(),
    decidedById: uuid("decided_by_id"),
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
    // One question of a kind waits per quote; a second one is refused until it is answered.
    uniqueIndex("quote_inquiry_pending_unique").on(table.quoteId, table.kind).where(sql`status = 'pending' AND deleted_at IS NULL`),
    check("quote_inquiry_kind_check", sql`${table.kind} IN ('margin')`),
    check("quote_inquiry_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected', 'withdrawn')`),
    check("quote_inquiry_decision_check", sql`${table.decision} IS NULL OR ${table.decision} IN ('approve', 'counter', 'reject')`),
  ],
);

export type QuoteInquiryRecord = typeof quoteInquiryTable.$inferSelect;
export type NewQuoteInquiryRecord = typeof quoteInquiryTable.$inferInsert;
