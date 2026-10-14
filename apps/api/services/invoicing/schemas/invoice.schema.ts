import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, integer, jsonb, date, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/** Issuer details as they were when the invoice was issued. */
export interface SupplierSnapshot {
  companyName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  ico: string;
  dic: string;
  vatPayer: boolean;
  registerEntry: string;
  email: string;
  phone: string;
  web: string;
  logoData: string;
  footerNote: string;
  /** The account in the invoice currency, if one exists. */
  bankAccount: { currency: string; bankName: string; accountNumber: string; iban: string; swift: string } | null;
}

/** Customer details as they were when the invoice was issued. */
export interface CustomerSnapshot {
  customerId: string;
  companyName: string;
  address: string;
  city: string;
  country: string;
  ico: string;
  dic: string;
  paymentTerms: string;
}

/** Shipment references printed on the invoice. */
export interface ShipmentSnapshot {
  jobNumber: string;
  /** Year of the job, part of the invoice number (INV2026...) */
  jobYear: number;
  tradeDirection: string;
  shipper: string;
  consignee: string;
  bookingNumber: string;
  containerNumber: string;
  personalReference: string;
}

export interface VatSummarySnapshot {
  vatCode: string;
  vatRate: number;
  base: number;
  vat: number;
  baseCzk: number;
  vatCzk: number;
}

/**
 * An issued tax document (invoice or credit note). Never edited after issuing: a database
 * trigger (migration 0010) rejects changes to the legal content and any delete.
 * Corrections are made with a credit note that points at the original.
 */
export const invoiceTable = pgTable(
  "invoice",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    /** invoice | credit_note */
    kind: text("kind").notNull().default("invoice"),
    /** issued | credited (an invoice reversed by a credit note) */
    status: text("status").notNull().default("issued"),
    number: text("number").notNull(),
    /** For a credit note: the invoice it corrects */
    correctsInvoiceId: uuid("corrects_invoice_id"),
    creditReason: text("credit_reason").notNull().default(""),
    customerId: uuid("customer_id").notNull(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    duzp: date("duzp", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    /**
     * Statutory rate for the CZK tax amounts (§4 odst. 8 ZDPH): ČNB, CZK per 1 unit of the
     * invoice currency, valid on the DUZP. fx_week is the older weekly-sheet label (invoices
     * issued before the ČNB switch); newer ones record the ČNB fixing date and source.
     */
    fxRate: numeric("fx_rate", { precision: 14, scale: 6 }).notNull(),
    fxWeek: text("fx_week").notNull().default(""),
    fxFixingDate: date("fx_fixing_date", { mode: "string" }),
    fxSource: text("fx_source").notNull().default(""), // CNB | weekly (older invoices)
    /** Company ROE % applied to lines priced in another currency (commercial rate, not tax) */
    roePct: numeric("roe_pct", { precision: 6, scale: 3 }),
    net: numeric("net", { precision: 14, scale: 2 }).notNull(),
    vat: numeric("vat", { precision: 14, scale: 2 }).notNull(),
    gross: numeric("gross", { precision: 14, scale: 2 }).notNull(),
    netCzk: numeric("net_czk", { precision: 14, scale: 2 }).notNull(),
    vatCzk: numeric("vat_czk", { precision: 14, scale: 2 }).notNull(),
    grossCzk: numeric("gross_czk", { precision: 14, scale: 2 }).notNull(),
    vatSummary: jsonb("vat_summary").$type<VatSummarySnapshot[]>().notNull(),
    supplier: jsonb("supplier").$type<SupplierSnapshot>().notNull(),
    customer: jsonb("customer").$type<CustomerSnapshot>().notNull(),
    shipment: jsonb("shipment").$type<ShipmentSnapshot>().notNull(),
    note: text("note").notNull().default(""),
    issuedBy: uuid("issued_by").notNull(),
    /** Same key twice (double click, retry) returns the first invoice instead of a second one. */
    idempotencyKey: text("idempotency_key"),
    /** Stored PDF (phase 3c) */
    pdfKey: text("pdf_key").notNull().default(""),
    pdfSha256: text("pdf_sha256").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("invoice", table),
    tenantIndex("invoice", table),
    index("invoice_shipment_id_idx").on(table.shipmentId),
    index("invoice_customer_id_idx").on(table.customerId),
    uniqueIndex("invoice_company_number_unique").on(table.companyId, table.number),
    uniqueIndex("invoice_company_idempotency_unique").on(table.companyId, table.idempotencyKey),
    check("invoice_kind_check", sql`${table.kind} IN ('invoice', 'credit_note')`),
    check("invoice_status_check", sql`${table.status} IN ('issued', 'credited')`),
  ],
);

export const invoiceLineTable = pgTable(
  "invoice_line",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoiceTable.id),
    seq: integer("seq").notNull(),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    unitCurrency: text("unit_currency").notNull(),
    /** Line total in the invoice currency */
    net: numeric("net", { precision: 14, scale: 2 }).notNull(),
    /** Invoice-currency units per 1 unit_currency used for this line (ČNB cross rate × ROE %); 1 when the same */
    fxRate: numeric("fx_rate", { precision: 14, scale: 6 }),
    vatCode: text("vat_code").notNull(),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull(),
    sourceSellingCostId: uuid("source_selling_cost_id"),
  },
  (table) => [
    ...defaultTableIndexes("invoice_line", table),
    tenantIndex("invoice_line", table),
    index("invoice_line_invoice_id_idx").on(table.invoiceId),
  ],
);

export type InvoiceRecord = typeof invoiceTable.$inferSelect;
export type NewInvoiceRecord = typeof invoiceTable.$inferInsert;
export type InvoiceLineRecord = typeof invoiceLineTable.$inferSelect;
export type NewInvoiceLineRecord = typeof invoiceLineTable.$inferInsert;
