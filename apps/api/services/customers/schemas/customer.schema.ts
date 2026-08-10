import { sql } from "drizzle-orm";
import { pgTable, text, integer, numeric, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const customerTable = pgTable(
  "customer",
  {
    ...defaultTableColumns,
    ...tenantColumns,

    // — ARES registry data —
    ico: text("ico").notNull(),
    dic: text("dic").notNull().default(""),
    companyName: text("company_name").notNull(),
    legalForm: text("legal_form").notNull().default(""),
    registeredAddress: text("registered_address").notNull().default(""),
    city: text("city").notNull().default(""),
    country: text("country").notNull().default("CZ"),
    companyStatus: text("company_status").notNull().default(""),
    registrationDate: text("registration_date").notNull().default(""),
    nace: text("nace").notNull().default(""),
    dataSource: text("data_source").notNull().default("ARES"),
    lastRegistryUpdate: text("last_registry_update").notNull().default(""),

    // — CRM data —
    status: text("status").notNull().default("Prospect"), // Active / Inactive / Prospect
    salesOwner: text("sales_owner").notNull().default(""),
    label: text("label").notNull().default("STANDARD"), // KEY ACCOUNT / STANDARD / RISK / TARGET CUSTOMER / PROSPECT
    // Money as numeric (exact) rather than real (lossy float); mode:"number" keeps the API type a JS number.
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("EUR"),
    paymentTerms: text("payment_terms").notNull().default(""),
    freightPaymentTerms: text("freight_payment_terms").notNull().default(""),
    dutyPaymentTerms: text("duty_payment_terms").notNull().default(""),

    // — Logo + website (logo stored as base64 data URL in Postgres) —
    companyWebsite: text("company_website").notNull().default(""),
    logoData: text("logo_data").notNull().default(""),
    logoSource: text("logo_source").notNull().default(""),
    logoUpdatedAt: text("logo_updated_at").notNull().default(""),

    // — Computed rollups —
    totalRevenue: numeric("total_revenue", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    totalProfit: numeric("total_profit", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    totalShipments: integer("total_shipments").notNull().default(0),
    lastActivityDate: text("last_activity_date").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("customer", table),
    tenantIndex("customer", table),
    index("customer_status_idx").on(table.status),
    // IČO is unique per company among live customers, so different companies can each
    // have the same Czech entity as a customer, and a soft-deleted one can be re-created.
    uniqueIndex("customer_company_ico_unique")
      .on(table.companyId, table.ico)
      .where(sql`deleted_at IS NULL`),
    // Closed sets driven by UI selects — reject anything else at the DB level so a typo
    // can't silently drop a customer out of every status filter and KPI.
    check("customer_status_check", sql`${table.status} IN ('Active', 'Prospect', 'Inactive')`),
    check(
      "customer_label_check",
      sql`${table.label} IN ('KEY ACCOUNT', 'STANDARD', 'TARGET CUSTOMER', 'PROSPECT', 'RISK')`,
    ),
  ],
);

export type CustomerRecord = typeof customerTable.$inferSelect;
export type NewCustomerRecord = typeof customerTable.$inferInsert;
