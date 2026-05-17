import { pgTable, text, jsonb, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const quoteTable = pgTable(
  "quote",
  {
    ...defaultTableColumns,
    quoteNumber: text("quote_number").notNull().unique(),
    data: jsonb("data").notNull().default({}),
    terms: text("terms").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("quote", table),
    index("quote_quote_number_idx").on(table.quoteNumber),
  ],
);

export type QuoteRecord = typeof quoteTable.$inferSelect;
export type NewQuoteRecord = typeof quoteTable.$inferInsert;
