import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, uuid, timestamp, date, integer, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const quoteTable = pgTable(
  "quote",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    quoteNumber: text("quote_number").notNull(),
    data: jsonb("data").notNull().default({}),
    terms: text("terms").notNull().default(""),
    // The lifecycle facts of a sales quote: the truth, written by the server only, and mirrored
    // into `data` for readers of the document. A row is a sales quote when its status is filled;
    // NULL = a row of the old quotes module, or a sales quote written by older code whose columns
    // quote_adopt_lifecycle (migration 0004) has yet to fill from its document.
    status: text("status"),
    substatus: text("substatus"),
    lostReason: text("lost_reason"),
    lostComment: text("lost_comment"),
    // The last sending; first_sent_at is the first one and never moves later once set.
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstSentAt: timestamp("first_sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    validUntil: date("valid_until", { mode: "string" }),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    // The owner is an auth user (another database, so no FK) plus the text old readers see: the
    // user's e-mail, or a name typed before owners were users.
    // owner_match_checked_at is set once the label was compared with the company's users,
    // matched or not, so a user created later never claims old labels.
    ownerUserId: uuid("owner_user_id"),
    ownerLabel: text("owner_label").notNull().default(""),
    ownerMatchCheckedAt: timestamp("owner_match_checked_at", { withTimezone: true }),
    // The first live shipment created from, or naming, this quote (shipments database, no FK).
    shipmentId: uuid("shipment_id"),
    shipmentJobNumber: text("shipment_job_number"),
    deletedBy: uuid("deleted_by"),
    // Incremented by every write of the document, so two editors cannot overwrite each other.
    dataVersion: integer("data_version").notNull().default(1),
    // The customer stays a fact of the document; this column only follows it, so no write path
    // can forget it. Anything that is not a uuid gives NULL instead of an error.
    customerId: uuid("customer_id").generatedAlwaysAs(
      sql`CASE WHEN (data->>'customerId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (data->>'customerId')::uuid END`,
    ),
  },
  (table) => [
    ...defaultTableIndexes("quote", table),
    tenantIndex("quote", table),
    // Quote references are a per-company sequence, unique within a company. Kept across
    // soft-delete (a reference is never reused), so this is a plain unique on (company, ref).
    uniqueIndex("quote_company_number_unique").on(table.companyId, table.quoteNumber),
    index("quote_company_status_idx").on(table.companyId, table.status),
    // Every read is per company: the company leads.
    index("quote_company_customer_id_idx").on(table.companyId, table.customerId),
    index("quote_company_owner_user_id_idx").on(table.companyId, table.ownerUserId),
    // The quotes a shipment is linked to (shipmentLinks).
    index("quote_company_linked_idx").on(table.companyId).where(sql`shipment_id IS NOT NULL`),
    // References that start with a prefix (createWithReference, a family): LIKE 'prefix%' can use
    // a btree only with pattern ops under a non-C collation.
    index("quote_company_number_pattern_idx").on(table.companyId, table.quoteNumber.op("text_pattern_ops")),
    // Holds exactly the sales quotes whose columns are not filled yet, so "is anything waiting
    // to be adopted" is an index probe that normally finds nothing. quote_adopt_lifecycle
    // repeats this predicate word for word.
    check("quote_data_version_check", sql`${table.dataVersion} >= 1`),
    index("quote_unadopted_idx")
      .on(table.companyId)
      .where(sql`status IS NULL AND jsonb_typeof(data->'quoteStatus') = 'string' AND btrim(data->>'quoteStatus') <> ''`),
  ],
);

export type QuoteRecord = typeof quoteTable.$inferSelect;
/** A row that is a sales quote: its lifecycle columns are filled. */
export type SalesQuoteRecord = QuoteRecord & { status: string };
export type NewQuoteRecord = typeof quoteTable.$inferInsert;
