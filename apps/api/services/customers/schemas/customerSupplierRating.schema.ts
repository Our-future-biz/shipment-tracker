import { sql } from "drizzle-orm";
import { pgTable, text, uuid, smallint, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";

// Every change of a supplier's rating, kept as it was made: rows are only added, never changed.
// createdAt is when it was set. The current rating is on the customer itself.
export const customerSupplierRatingTable = pgTable(
  "customer_supplier_rating",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    // 0–5 stars, or null when the rating was cleared (back to not rated).
    rating: smallint("rating"),
    reason: text("reason").notNull().default(""),
    setBy: text("set_by").notNull().default(""),
    setByUserId: uuid("set_by_user_id"),
  },
  (table) => [
    ...defaultTableIndexes("customer_supplier_rating", table),
    tenantIndex("customer_supplier_rating", table),
    index("customer_supplier_rating_customer_id_idx").on(table.customerId, table.createdAt),
    check("customer_supplier_rating_rating_check", sql`${table.rating} BETWEEN 0 AND 5`),
  ],
);

export type CustomerSupplierRatingRecord = typeof customerSupplierRatingTable.$inferSelect;
export type NewCustomerSupplierRatingRecord = typeof customerSupplierRatingTable.$inferInsert;
