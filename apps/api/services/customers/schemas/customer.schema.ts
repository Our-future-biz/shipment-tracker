import { sql } from "drizzle-orm";
import { pgTable, text, integer, smallint, numeric, date, index, uniqueIndex, check, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { CustomerLabel, CustomerRole, CustomerStatus, RiskLevelOverride, SupplierApprovalDecision, SupplierApprovalStatus } from "../interfaces/interfaces";

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
    // No longer read or written: ARES never sent the field it was filled from. Dropped once every branch is on main.
    companyStatus: text("company_status").notNull().default(""),
    registrationDate: date("registration_date", { mode: "string" }),
    nace: text("nace").notNull().default(""),
    // Company analysis typed in by hand: each overrides what is derived from the registry data; "" = derived.
    industry: text("industry").notNull().default(""),
    typicalCargo: text("typical_cargo").notNull().default(""),
    stability: text("stability").notNull().default(""),
    riskLevel: text("risk_level").$type<RiskLevelOverride>().notNull().default(""),
    dataSource: text("data_source").notNull().default("ARES"),
    lastRegistryUpdate: text("last_registry_update").notNull().default(""),

    // — CRM data —
    status: text("status").$type<CustomerStatus>().notNull().default("Prospect"),
    // The owner's e-mail as it was when the user was picked (a person is recorded by e-mail); empty, or a
    // name typed before owners were users (POST /customers/people/normalize links those it can).
    salesOwner: text("sales_owner").notNull().default(""),
    // A user of the auth service (another database, so no foreign key); null when nobody is picked.
    salesOwnerUserId: uuid("sales_owner_user_id"),
    label: text("label").$type<CustomerLabel>().notNull().default("TARGET CUSTOMER"),
    // Money as numeric (exact) rather than real (lossy float); mode:"number" keeps the API type a JS number.
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("EUR"),
    // Up to two other currencies the customer may be billed in; billing in one asks to confirm.
    secondaryCurrencies: text("secondary_currencies").array().notNull().default(sql`'{}'::text[]`),
    paymentTerms: text("payment_terms").notNull().default(""),
    freightPaymentTerms: text("freight_payment_terms").notNull().default(""),
    dutyPaymentTerms: text("duty_payment_terms").notNull().default(""),
    // What the company is to us; a haulier is a trucking subcontractor, a rail operator a rail supplier, a first / last mile
    // haulier trucks containers to and from ports and terminals, a shipping line sells ocean freight. Existing rows become customers.
    roles: text("roles").array().$type<CustomerRole[]>().notNull().default(sql`'{customer}'::text[]`),

    // — Supplier rating (a company with a supplier role) —
    // 0–5 whole stars set by hand by a manager; null = not rated (0 is a rating: the worst). Who set it,
    // when and why go with it; every change is also kept in customer_supplier_rating.
    supplierRating: smallint("supplier_rating"),
    supplierRatingReason: text("supplier_rating_reason").notNull().default(""),
    // The e-mail of who set it, as a person is recorded, and the user (another database, so no foreign key).
    supplierRatingBy: text("supplier_rating_by").notNull().default(""),
    supplierRatingByUserId: uuid("supplier_rating_by_user_id"),
    supplierRatingAt: timestamp("supplier_rating_at", { withTimezone: true }),

    // — A supplier's terms and checks (step 6b): what we pay it, and the VAT register checks before we do —
    // The one place they are edited; a haulier's are also copied to Trucking on every save, whose rules run on them.
    // Payment days and currency are null until set: a customer's paymentTerms are our terms to it, not these.
    supplierPaymentDays: integer("supplier_payment_days"),
    supplierCurrency: text("supplier_currency"),
    supplierVatUnreliable: boolean("supplier_vat_unreliable").notNull().default(false),
    supplierBankAccountPublished: boolean("supplier_bank_account_published").notNull().default(false),
    supplierVatCheckedAt: date("supplier_vat_checked_at", { mode: "string" }),
    // Normalised (lib/bankAccount.ts). When one was last added, and by whom: a haulier's exact-match
    // invoice is not approved automatically for 30 days after (Trucking).
    supplierBankAccounts: text("supplier_bank_accounts").array().notNull().default(sql`'{}'::text[]`),
    supplierBankAccountsChangedAt: timestamp("supplier_bank_accounts_changed_at", { withTimezone: true }),
    supplierBankAccountsChangedByUserId: uuid("supplier_bank_accounts_changed_by_user_id"),
    supplierBankAccountsChangedBy: text("supplier_bank_accounts_changed_by").notNull().default(""),

    // — A new supplier waiting for a manager (Sales → Managers → Company approval) —
    // A user who is no manager adds a supplier from a quote's Pricing: the company is in the Customer
    // Database at once, "pending" until a manager approves it ("" again) or declines it ("declined": it is
    // deleted, and can be restored). A quote linked to a pending or declined supplier is not sent.
    approvalStatus: text("approval_status").$type<SupplierApprovalStatus>().notNull().default(""),
    // Who asked (e-mail as a person is recorded, and the user) and from which quote.
    approvalRequestedBy: text("approval_requested_by").notNull().default(""),
    approvalRequestedByUserId: uuid("approval_requested_by_user_id"),
    approvalRequestedAt: timestamp("approval_requested_at", { withTimezone: true }),
    approvalQuoteNumber: text("approval_quote_number").notNull().default(""),
    // The manager's answer: who, when, and why a decline.
    approvalDecision: text("approval_decision").$type<SupplierApprovalDecision>().notNull().default(""),
    approvalDecidedBy: text("approval_decided_by").notNull().default(""),
    approvalDecidedByUserId: uuid("approval_decided_by_user_id"),
    approvalDecidedAt: timestamp("approval_decided_at", { withTimezone: true }),
    approvalComment: text("approval_comment").notNull().default(""),
    // When the one who asked opened the answer in their bell.
    approvalAnswerSeenAt: timestamp("approval_answer_seen_at", { withTimezone: true }),

    // — Logo + website (logo stored as base64 data URL in Postgres) —
    companyWebsite: text("company_website").notNull().default(""),
    logoData: text("logo_data").notNull().default(""),
    logoSource: text("logo_source").notNull().default(""),
    logoUpdatedAt: text("logo_updated_at").notNull().default(""),

    // — Computed rollups —
    totalRevenue: numeric("total_revenue", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    totalProfit: numeric("total_profit", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    totalShipments: integer("total_shipments").notNull().default(0),
    lastActivityDate: date("last_activity_date", { mode: "string" }),
  },
  (table) => [
    ...defaultTableIndexes("customer", table),
    tenantIndex("customer", table),
    index("customer_status_idx").on(table.status),
    // IČO (a registration number for a foreign customer) is unique per company and country among live
    // customers: different companies can each have the same entity as a customer, a soft-deleted one can be
    // re-created, and a foreign register's number (a German "HRB 12345", issued by each court) never clashes
    // with the same text of another country's. A foreign customer may have none: those are not compared.
    // The country is matched as lib/registerNumber reads it.
    uniqueIndex("customer_company_country_ico_unique")
      .on(table.companyId, table.country, table.ico)
      .where(sql`deleted_at IS NULL AND ico <> ''`),
    // Closed sets driven by UI selects — reject anything else at the DB level so a typo
    // can't silently drop a customer out of every status filter and KPI.
    check("customer_risk_level_check", sql`${table.riskLevel} IN ('', 'Low', 'Medium', 'High')`),
    check("customer_status_check", sql`${table.status} IN ('Active', 'Prospect', 'Inactive')`),
    check(
      "customer_label_check",
      sql`${table.label} IN ('KEY ACCOUNT', 'STANDARD', 'TARGET CUSTOMER', 'RISK')`,
    ),
    check("customer_supplier_rating_check", sql`${table.supplierRating} BETWEEN 0 AND 5`),
    check("customer_approval_status_check", sql`${table.approvalStatus} IN ('', 'pending', 'declined')`),
    check("customer_approval_decision_check", sql`${table.approvalDecision} IN ('', 'approved', 'declined')`),
    // The Company approval list: what waits, and what was answered lately.
    index("customer_approval_idx").on(table.companyId, table.approvalRequestedAt).where(sql`approval_requested_at IS NOT NULL`),
    check("customer_supplier_payment_days_check", sql`${table.supplierPaymentDays} BETWEEN 0 AND 365`),
    // At least one role, and only known ones.
    check(
      "customer_roles_check",
      sql`cardinality(${table.roles}) > 0 AND ${table.roles} <@ ARRAY['customer', 'haulier', 'rail_operator', 'first_last_mile_haulier', 'shipping_line', 'co_loader']::text[]`,
    ),
  ],
);

export type CustomerRecord = typeof customerTable.$inferSelect;
/** A customer as lists and reads load it: every column but the logo's bytes, and the logo's length. */
export type CustomerItemRow = Omit<CustomerRecord, "logoData"> & { logoLength: number };
export type NewCustomerRecord = typeof customerTable.$inferInsert;
