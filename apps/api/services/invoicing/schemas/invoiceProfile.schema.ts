import { pgTable, text, boolean, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/** One bank account the customer can pay to, per invoice currency. */
export interface BankAccount {
  currency: string;
  bankName: string;
  /** Czech account number, e.g. "123456789/0800" (optional for foreign accounts). */
  accountNumber: string;
  iban: string;
  swift: string;
}

/**
 * Issuer details printed on every invoice (the company's own name, address, IČO, DIČ,
 * bank accounts). One row per company; edited by an admin under Settings → Organization.
 * An issued invoice keeps its own snapshot, so later edits never change old invoices.
 */
export const invoiceProfileTable = pgTable(
  "invoice_profile",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    companyName: text("company_name").notNull().default(""),
    street: text("street").notNull().default(""),
    city: text("city").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    country: text("country").notNull().default("CZ"),
    ico: text("ico").notNull().default(""),
    dic: text("dic").notNull().default(""),
    /** Plátce DPH - a non-payer issues invoices without VAT. */
    vatPayer: boolean("vat_payer").notNull().default(true),
    /** Commercial register entry, e.g. "C 12345 vedená u Městského soudu v Praze". */
    registerEntry: text("register_entry").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    web: text("web").notNull().default(""),
    /** Logo as a data URL (PNG/JPEG), printed in the invoice header. */
    logoData: text("logo_data").notNull().default(""),
    bankAccounts: jsonb("bank_accounts").$type<BankAccount[]>().notNull().default([]),
    /** Used when the customer has no payment terms. */
    defaultDueDays: integer("default_due_days").notNull().default(14),
    /** Free text printed at the bottom of every invoice. */
    footerNote: text("footer_note").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("invoice_profile", table),
    tenantIndex("invoice_profile", table),
    uniqueIndex("invoice_profile_company_unique").on(table.companyId),
  ],
);

export type InvoiceProfileRecord = typeof invoiceProfileTable.$inferSelect;
export type NewInvoiceProfileRecord = typeof invoiceProfileTable.$inferInsert;
