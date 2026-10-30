import { sql } from "drizzle-orm";
import { pgTable, text, uuid, boolean, doublePrecision, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";
import { customerAddressTable } from "./customerAddress.schema";
import type { CustomerSiteKind } from "../interfaces/interfaces";

// A loading / delivery address of a customer. Structured (street, postcode, city, country) rather
// than one text, because trucking prices by postcode zone. Each one is a Pickup / Delivery address
// of the customer's Addresses (address_id), whose name, use and address it follows (lib/addressSite).
export const customerSiteTable = pgTable(
  "customer_site",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    // The Pickup / Delivery address the site is; null only for a site from before they were linked.
    addressId: uuid("address_id").references(() => customerAddressTable.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    kind: text("kind").$type<CustomerSiteKind>().notNull().default("both"),
    street: text("street").notNull().default(""),
    // Czech postcodes are stored as 5 digits without the space ("11000"); see lib/postcode.ts.
    postcode: text("postcode").notNull(),
    city: text("city").notNull().default(""),
    country: text("country").notNull().default("CZ"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    openingHours: text("opening_hours").notNull().default(""),
    avizaceName: text("avizace_name").notNull().default(""),
    avizacePhone: text("avizace_phone").notNull().default(""),
    avizaceEmail: text("avizace_email").notNull().default(""),
    loadingNotes: text("loading_notes").notNull().default(""),
    tailLiftNeeded: boolean("tail_lift_needed").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (table) => [
    ...defaultTableIndexes("customer_site", table),
    tenantIndex("customer_site", table),
    index("customer_site_customer_id_idx").on(table.customerId),
    // One live site per address.
    uniqueIndex("customer_site_one_per_address").on(table.addressId).where(sql`${table.addressId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    // At most one live default site per customer.
    uniqueIndex("customer_site_one_default").on(table.customerId).where(sql`${table.isDefault} AND ${table.deletedAt} IS NULL`),
    check("customer_site_kind_check", sql`${table.kind} IN ('loading', 'delivery', 'both')`),
  ],
);

export type CustomerSiteRecord = typeof customerSiteTable.$inferSelect;
export type NewCustomerSiteRecord = typeof customerSiteTable.$inferInsert;
