import { pgTable, text, integer, real, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const customerTable = pgTable(
  "customer",
  {
    ...defaultTableColumns,

    // — ARES registry data —
    ico: text("ico").notNull().unique(),
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
    creditLimit: real("credit_limit").notNull().default(0),
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
    totalRevenue: real("total_revenue").notNull().default(0),
    totalProfit: real("total_profit").notNull().default(0),
    totalShipments: integer("total_shipments").notNull().default(0),
    lastActivityDate: text("last_activity_date").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("customer", table),
    index("customer_ico_idx").on(table.ico),
    index("customer_status_idx").on(table.status),
  ],
);

export type CustomerRecord = typeof customerTable.$inferSelect;
export type NewCustomerRecord = typeof customerTable.$inferInsert;
