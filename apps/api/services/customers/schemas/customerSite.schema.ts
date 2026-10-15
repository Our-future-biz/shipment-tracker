import { sql } from "drizzle-orm";
import { pgTable, text, uuid, boolean, doublePrecision, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";
import type { CustomerSiteKind } from "../interfaces/interfaces";

// A loading / delivery address of a customer. Structured (street, postcode, city, country) rather
// than one text, because trucking prices by postcode zone.
export const customerSiteTable = pgTable(
  "customer_site",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
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
    check("customer_site_kind_check", sql`${table.kind} IN ('loading', 'delivery', 'both')`),
  ],
);

export type CustomerSiteRecord = typeof customerSiteTable.$inferSelect;
export type NewCustomerSiteRecord = typeof customerSiteTable.$inferInsert;
