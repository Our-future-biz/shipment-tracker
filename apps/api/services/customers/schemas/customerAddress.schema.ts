import { sql } from "drizzle-orm";
import { pgTable, text, uuid, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";
import type { AddressType } from "../interfaces/interfaces";

// The places of a customer: its seat (Registered, from ARES or typed in when the customer was created),
// where invoices go, and where goods are picked up or delivered.
export const customerAddressTable = pgTable(
  "customer_address",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    type: text("type").$type<AddressType>().notNull(),
    // An optional name telling addresses of one type apart, e.g. "Plant Kolín".
    label: text("label").notNull().default(""),
    street: text("street").notNull().default(""),
    city: text("city").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    // ISO 3166-1 alpha-2.
    country: text("country").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("customer_address", table),
    tenantIndex("customer_address", table),
    index("customer_address_customer_id_idx").on(table.customerId),
    check("customer_address_type_check", sql`${table.type} IN ('Registered', 'Billing', 'Pickup', 'Delivery', 'Warehouse')`),
  ],
);

export type CustomerAddressRecord = typeof customerAddressTable.$inferSelect;
export type NewCustomerAddressRecord = typeof customerAddressTable.$inferInsert;
