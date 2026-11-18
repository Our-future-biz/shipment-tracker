import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, date, index, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns } from "../../../lib/db/defaults";
import { invoiceTable } from "./invoice.schema";

// Issued invoices and credit notes handed to the accounting system (step 7; the owner's system is Pohoda): each export
// as a file, and which documents it carried, so the next export leaves them out unless asked to include them again.
// The export is one way: payments come into the app from the bank statement, never back from Pohoda (D26: one source).

export type AccountingSystem = "pohoda";

export const accountingExportTable = pgTable(
  "accounting_export",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    system: text("system").$type<AccountingSystem>().notNull().default("pohoda"),
    /** The issue days the export covered */
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    documents: integer("documents").notNull().default(0),
    fileName: text("file_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdBy: text("created_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("accounting_export", table),
    index("accounting_export_company_idx").on(table.companyId, table.createdAt),
    check("accounting_export_system_check", sql`${table.system} IN ('pohoda')`),
  ],
);

export type AccountingExportRecord = typeof accountingExportTable.$inferSelect;
export type NewAccountingExportRecord = typeof accountingExportTable.$inferInsert;

export const accountingExportDocumentTable = pgTable(
  "accounting_export_document",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    exportId: uuid("export_id").notNull(),
    /** An invoice or a credit note (both are `invoice` rows) */
    invoiceId: uuid("invoice_id").notNull(),
    system: text("system").$type<AccountingSystem>().notNull().default("pohoda"),
  },
  (table) => [
    ...defaultTableIndexes("accounting_export_document", table),
    index("accounting_export_document_invoice_idx").on(table.companyId, table.system, table.invoiceId),
    index("accounting_export_document_export_idx").on(table.exportId),
    foreignKey({ columns: [table.exportId], foreignColumns: [accountingExportTable.id], name: "accounting_export_document_export_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [invoiceTable.id], name: "accounting_export_document_invoice_fk" }),
  ],
);

export type AccountingExportDocumentRecord = typeof accountingExportDocumentTable.$inferSelect;
