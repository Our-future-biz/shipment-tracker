import { sql } from "drizzle-orm";
import { pgTable, text, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const quoteRefSequenceTable = pgTable(
  "quote_ref_sequence",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    quoteNumber: text("quote_number").notNull(),
    nextSubLine: integer("next_sub_line").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("quote_ref_sequence", table),
    tenantIndex("quote_ref_sequence", table),
    // One counter row per quote per company (fixes the duplicate-counter race).
    uniqueIndex("quote_ref_sequence_company_number_unique")
      .on(table.companyId, table.quoteNumber)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type QuoteRefSequenceRecord = typeof quoteRefSequenceTable.$inferSelect;
export type NewQuoteRefSequenceRecord = typeof quoteRefSequenceTable.$inferInsert;
