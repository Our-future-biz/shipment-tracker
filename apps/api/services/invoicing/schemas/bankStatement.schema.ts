import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, integer, boolean, date, timestamp, jsonb, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns } from "../../../lib/db/defaults";

// A bank statement read into Accounts Receivable (step 7; the owner's bank gives CAMT.053 XML): the file once, and each
// of its entries, an incoming one proposed as a payment of the invoices it seems to pay. Nothing is noted until a manager
// confirms the entry (D11): the app mirrors the bank, it never decides alone that money came in.

export const bankStatementTable = pgTable(
  "bank_statement",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    fileName: text("file_name").notNull(),
    /** The same file read twice is the same statement */
    fileSha256: text("file_sha256").notNull(),
    format: text("format").notNull().default("camt.053"),
    /** The statement's own id (Stmt/Id) */
    statementRef: text("statement_ref").notNull().default(""),
    accountIban: text("account_iban").notNull().default(""),
    currency: text("currency").notNull().default(""),
    fromDate: date("from_date", { mode: "string" }),
    toDate: date("to_date", { mode: "string" }),
    entries: integer("entries").notNull().default(0),
    importedByUserId: uuid("imported_by_user_id"),
    importedBy: text("imported_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("bank_statement", table),
    uniqueIndex("bank_statement_file_unique").on(table.companyId, table.fileSha256).where(sql`deleted_at IS NULL`),
    index("bank_statement_company_idx").on(table.companyId, table.createdAt),
  ],
);

export type BankStatementRecord = typeof bankStatementTable.$inferSelect;
export type NewBankStatementRecord = typeof bankStatementTable.$inferInsert;

/**
 * proposed: an incoming entry with invoices it may pay (candidates); no_match: incoming, nothing found; confirmed: a
 * manager noted it as payments (allocations); ignored: a manager set it aside with a reason; not_incoming: money out,
 * kept for the record only.
 */
export type BankEntryStatus = "proposed" | "no_match" | "confirmed" | "ignored" | "not_incoming";

/** An invoice an entry may pay, as worked out when the file was read (lib/bankMatch). */
export interface BankEntryCandidate {
  invoiceId: string;
  number: string;
  customer: string;
  jobNumber: string;
  leftToPay: number;
  currency: string;
  /** Why it was proposed: the variable symbol, the invoice number in the message, the amount */
  reasons: string[];
  /** Higher first: an exact amount and the invoice number in the message rank above the symbol alone */
  score: number;
}

/** What a confirmed entry was noted as: one payment per invoice, all with the entry's day and bank reference. */
export interface BankEntryAllocation {
  invoiceId: string;
  number: string;
  amount: number;
  paymentId: string;
  /** Which confirmation of the entry wrote it (1 when absent): an entry is confirmed again after a payment of it was taken back */
  round?: number;
}

export const bankStatementEntryTable = pgTable(
  "bank_statement_entry",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    statementId: uuid("statement_id").notNull(),
    /** The entry's key (lib/camt053): the bank's AcctSvcrRef, else a single transaction's bank reference, else a hash of its facts - one entry once */
    entryKey: text("entry_key").notNull(),
    bookingDate: date("booking_date", { mode: "string" }),
    valueDate: date("value_date", { mode: "string" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    /** Money in (CRDT) or out (DBIT) */
    credit: boolean("credit").notNull(),
    variableSymbol: text("variable_symbol").notNull().default(""),
    constantSymbol: text("constant_symbol").notNull().default(""),
    specificSymbol: text("specific_symbol").notNull().default(""),
    endToEndId: text("end_to_end_id").notNull().default(""),
    counterpartyName: text("counterparty_name").notNull().default(""),
    counterpartyAccount: text("counterparty_account").notNull().default(""),
    /** The payment's message (RmtInf/Ustrd), where a customer often writes the invoice number */
    message: text("message").notNull().default(""),
    status: text("status").$type<BankEntryStatus>().notNull().default("proposed"),
    candidates: jsonb("candidates").$type<BankEntryCandidate[]>().notNull().default([]),
    allocations: jsonb("allocations").$type<BankEntryAllocation[]>().notNull().default([]),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedBy: text("decided_by").notNull().default(""),
    decisionReason: text("decision_reason").notNull().default(""),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("bank_statement_entry", table),
    uniqueIndex("bank_statement_entry_key_unique").on(table.companyId, table.entryKey).where(sql`deleted_at IS NULL`),
    index("bank_statement_entry_statement_idx").on(table.statementId, table.bookingDate),
    index("bank_statement_entry_open_idx").on(table.companyId, table.status).where(sql`deleted_at IS NULL AND status IN ('proposed', 'no_match')`),
    foreignKey({ columns: [table.statementId], foreignColumns: [bankStatementTable.id], name: "bank_statement_entry_statement_fk" }).onDelete("cascade"),
    check("bank_statement_entry_status_check", sql`${table.status} IN ('proposed', 'no_match', 'confirmed', 'ignored', 'not_incoming')`),
  ],
);

export type BankStatementEntryRecord = typeof bankStatementEntryTable.$inferSelect;
export type NewBankStatementEntryRecord = typeof bankStatementEntryTable.$inferInsert;
