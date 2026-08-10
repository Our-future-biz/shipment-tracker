import { sql } from "drizzle-orm";
import { pgTable, text, uuid, boolean, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";

export const contactTable = pgTable(
  "contact",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    role: text("role").notNull().default("Operations"), // Sales / Operations / Finance
    isMain: boolean("is_main").notNull().default(false),
  },
  (table) => [
    ...defaultTableIndexes("contact", table),
    tenantIndex("contact", table),
    index("contact_customer_id_idx").on(table.customerId),
    check("contact_role_check", sql`${table.role} IN ('Sales', 'Operations', 'Finance')`),
  ],
);

export type ContactRecord = typeof contactTable.$inferSelect;
export type NewContactRecord = typeof contactTable.$inferInsert;
