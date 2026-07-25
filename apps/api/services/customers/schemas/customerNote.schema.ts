import { pgTable, text, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";

export const customerNoteTable = pgTable(
  "customer_note",
  {
    ...defaultTableColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("Note"), // Note / Email / Call / Follow-up / Visit
    content: text("content").notNull(),
    author: text("author").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("customer_note", table),
    index("customer_note_customer_id_idx").on(table.customerId),
  ],
);

export type CustomerNoteRecord = typeof customerNoteTable.$inferSelect;
export type NewCustomerNoteRecord = typeof customerNoteTable.$inferInsert;
