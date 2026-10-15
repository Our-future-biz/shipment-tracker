import { sql } from "drizzle-orm";
import { pgTable, text, integer, numeric, date, boolean, jsonb, uuid, timestamp, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { HaulierInvoiceStatus, HaulierInvoiceTargetKind } from "../interfaces/haulierInvoice.interfaces";

// A haulier's invoice for trips and partner deliveries (Phase 6 B). The status is worked out on
// every save (lib/haulierInvoiceRules.ts): BLOCKED while the haulier fails the VAT bank-account
// check (nobody may approve payment then), APPROVED on an exact match, else NEEDS_APPROVAL until
// a manager approves or rejects it with a reason. One live invoice per (haulier, invoice number)
// unless rejected; `invoice_number_key` is the number upper-cased without spaces, so "FV 2026/12"
// and "fv2026/12" are the same invoice. The file (optional) lives in the trucking-documents bucket.
export const truckingHaulierInvoiceTable = pgTable(
  "trucking_haulier_invoice",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    haulierCustomerId: uuid("haulier_customer_id").notNull(),
    haulierName: text("haulier_name").notNull().default(""),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceNumberKey: text("invoice_number_key").notNull(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
    duzp: date("duzp", { mode: "string" }),
    currency: text("currency").$type<"CZK" | "EUR">().notNull(),
    totalNet: numeric("total_net", { precision: 14, scale: 2, mode: "number" }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
    totalGross: numeric("total_gross", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** Normalised (lib/bankAccount.ts) */
    bankAccount: text("bank_account").notNull(),
    /** Whether the account was among the haulier's published accounts at the last save / approval */
    bankAccountPublished: boolean("bank_account_published"),
    status: text("status").$type<HaulierInvoiceStatus>().notNull().default("DRAFT"),
    blockReasons: jsonb("block_reasons").$type<string[]>().notNull().default([]),
    /** totalNet − Σ expected */
    difference: numeric("difference", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedBy: text("approved_by"),
    approvalReason: text("approval_reason"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedByUserId: uuid("rejected_by_user_id"),
    rejectedBy: text("rejected_by"),
    rejectReason: text("reject_reason"),
    fileName: text("file_name"),
    fileContentType: text("file_content_type"),
    fileSizeBytes: integer("file_size_bytes"),
    fileSha256: text("file_sha256"),
    fileStorageKey: text("file_storage_key"),
    createdByUserId: uuid("created_by_user_id"),
    createdBy: text("created_by").notNull().default(""),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("trucking_haulier_invoice", table),
    tenantIndex("trucking_haulier_invoice", table),
    uniqueIndex("trucking_haulier_invoice_number_unique")
      .on(table.companyId, table.haulierCustomerId, table.invoiceNumberKey)
      .where(sql`deleted_at IS NULL AND status <> 'REJECTED'`),
    index("trucking_haulier_invoice_haulier_idx").on(table.companyId, table.haulierCustomerId, table.issueDate),
    index("trucking_haulier_invoice_status_idx").on(table.companyId, table.status),
    check("trucking_haulier_invoice_status_check", sql`${table.status} IN ('DRAFT', 'MATCHED', 'NEEDS_APPROVAL', 'APPROVED', 'BLOCKED', 'REJECTED')`),
    check("trucking_haulier_invoice_currency_check", sql`${table.currency} IN ('CZK', 'EUR')`),
    // Payment is never approved while blocked (ručení za DPH): an approved invoice has no block reason.
    check("trucking_haulier_invoice_approved_check", sql`${table.status} <> 'APPROVED' OR (${table.approvedAt} IS NOT NULL AND ${table.blockReasons} = '[]'::jsonb)`),
    check("trucking_haulier_invoice_rejected_check", sql`(${table.status} = 'REJECTED') = (${table.rejectedAt} IS NOT NULL)`),
  ],
);

/**
 * One trip or partner delivery on an invoice. `live` is false once the invoice is rejected: a
 * target is on at most one live line (the unique index), so it can never be paid twice.
 * `allocations` = where the approved real cost went (Road jobs get it in Costs Breakdown;
 * internal jobs keep it in Trucking's own ledger, which is this column).
 */
export const truckingHaulierInvoiceLineTable = pgTable(
  "trucking_haulier_invoice_line",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    invoiceId: uuid("invoice_id").notNull(),
    targetKind: text("target_kind").$type<HaulierInvoiceTargetKind>().notNull(),
    targetId: uuid("target_id").notNull(),
    targetRef: text("target_ref").notNull().default(""),
    expected: numeric("expected", { precision: 14, scale: 2, mode: "number" }).notNull(),
    claimed: numeric("claimed", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    invoiced: numeric("invoiced", { precision: 14, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").$type<"CZK" | "EUR">().notNull(),
    note: text("note").notNull().default(""),
    live: boolean("live").notNull().default(true),
    allocations: jsonb("allocations").$type<HaulierInvoiceAllocation[]>().notNull().default([]),
  },
  (table) => [
    ...defaultTableIndexes("trucking_haulier_invoice_line", table),
    tenantIndex("trucking_haulier_invoice_line", table),
    index("trucking_haulier_invoice_line_invoice_idx").on(table.invoiceId),
    uniqueIndex("trucking_haulier_invoice_line_target_unique")
      .on(table.companyId, table.targetKind, table.targetId)
      .where(sql`deleted_at IS NULL AND live`),
    foreignKey({ name: "trucking_haulier_invoice_line_invoice_fk", columns: [table.invoiceId], foreignColumns: [truckingHaulierInvoiceTable.id] }).onDelete("restrict"),
    check("trucking_haulier_invoice_line_kind_check", sql`${table.targetKind} IN ('TRIP', 'PARTNER_LEG')`),
    check("trucking_haulier_invoice_line_currency_check", sql`${table.currency} IN ('CZK', 'EUR')`),
  ],
);

/** A part of an approved line's real cost: to a job's Costs Breakdown, or kept in Trucking's ledger (internal job). */
export interface HaulierInvoiceAllocation {
  shipmentId: string;
  sourceRef: string;
  amount: number;
  currency: "CZK" | "EUR";
  internal: boolean;
}

export type TruckingHaulierInvoiceRecord = typeof truckingHaulierInvoiceTable.$inferSelect;
export type NewTruckingHaulierInvoiceRecord = typeof truckingHaulierInvoiceTable.$inferInsert;
export type TruckingHaulierInvoiceLineRecord = typeof truckingHaulierInvoiceLineTable.$inferSelect;
export type NewTruckingHaulierInvoiceLineRecord = typeof truckingHaulierInvoiceLineTable.$inferInsert;
