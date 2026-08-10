import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const quoteTable = pgTable(
  "quote",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    quoteNumber: text("quote_number").notNull(),
    data: jsonb("data").notNull().default({}),
    terms: text("terms").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("quote", table),
    tenantIndex("quote", table),
    // Quote references are a per-company sequence, unique within a company. Kept across
    // soft-delete (a reference is never reused), so this is a plain unique on (company, ref).
    uniqueIndex("quote_company_number_unique").on(table.companyId, table.quoteNumber),
  ],
);

export type QuoteRecord = typeof quoteTable.$inferSelect;
export type NewQuoteRecord = typeof quoteTable.$inferInsert;
