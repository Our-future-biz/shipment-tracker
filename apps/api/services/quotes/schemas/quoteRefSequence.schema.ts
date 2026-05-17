import { pgTable, text, integer, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const quoteRefSequenceTable = pgTable(
  "quote_ref_sequence",
  {
    ...defaultTableColumns,
    quoteNumber: text("quote_number").notNull(),
    nextSubLine: integer("next_sub_line").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("quote_ref_sequence", table),
    index("quote_ref_sequence_quote_number_idx").on(table.quoteNumber),
  ],
);

export type QuoteRefSequenceRecord = typeof quoteRefSequenceTable.$inferSelect;
export type NewQuoteRefSequenceRecord = typeof quoteRefSequenceTable.$inferInsert;
