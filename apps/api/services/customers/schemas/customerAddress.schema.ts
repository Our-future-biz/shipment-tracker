import { sql } from "drizzle-orm";
import { pgTable, text, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";
import type { AddressType } from "../interfaces/interfaces";

// The places of a customer: its seat (Registered, from ARES or typed in when the customer was created),
// where invoices (Billing - printed on them instead of the seat) and paperwork go, and where goods
// are picked up or delivered. One address can be
// several of these at once (often all of them): its types.
export const customerAddressTable = pgTable(
  "customer_address",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    types: text("types").array().$type<AddressType[]>().notNull(),
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
    // One seat per customer: at most one live Registered address.
    uniqueIndex("customer_address_one_registered")
      .on(table.customerId)
      .where(sql`'Registered' = ANY(${table.types}) AND ${table.deletedAt} IS NULL`),
    // One billing address per customer: the one its invoices are addressed to.
    uniqueIndex("customer_address_one_billing")
      .on(table.customerId)
      .where(sql`'Billing' = ANY(${table.types}) AND ${table.deletedAt} IS NULL`),
    // At least one type, and only known ones.
    check(
      "customer_address_types_check",
      sql`cardinality(${table.types}) > 0 AND ${table.types} <@ ARRAY['Registered', 'Billing', 'Paperwork', 'Pickup', 'Delivery', 'Warehouse']::text[]`,
    ),
  ],
);

export type CustomerAddressRecord = typeof customerAddressTable.$inferSelect;
export type NewCustomerAddressRecord = typeof customerAddressTable.$inferInsert;
