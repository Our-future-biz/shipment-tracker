import { round2 } from "./invoiceCalc";
import { variableSymbol } from "./invoicePdf";
import { daysOverdue, isOwed } from "./receivables";
import type { ReceivableStatus } from "../interfaces/interfaces";

/**
 * A customer's statement (Accounts Receivable step 7), kept pure so it can be tested on its own: the invoices still
 * owed in ONE currency, each with its issue and due day, days overdue, amount (with VAT), what its credit notes took
 * off, what is paid, what was written off (confirmed write-offs and bank charges) and what is left to pay - so
 * Amount − Credited − Paid − Written off = Left to pay on every line - and the totals, as at today (the Prague business day). Amounts stay in
 * the invoice's currency: never converted, never added across currencies. Read from Accounts Receivable's own rows
 * (receivableService.rowsOfCustomer), so a statement always says what the page says.
 */

export type StatementLanguage = "cs" | "en";

/** The customer's language as the Customer Database gives it; anything else reads as English. */
export const languageOf = (value: unknown): StatementLanguage => (value === "cs" ? "cs" : "en");

/** What a statement needs of an Accounts Receivable row (ReceivableItem). */
export interface StatementRowInput {
  id: string;
  number: string;
  jobNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  gross: number;
  credited: number;
  paid: number;
  /** Confirmed write-offs (not taken back) */
  writtenOff: number;
  /** Confirmed bank charges (not taken back) */
  bankCharges: number;
  leftToPay: number;
  status: ReceivableStatus;
}

export interface StatementLine {
  invoiceId: string;
  number: string;
  jobNumber: string;
  /** The variable symbol the invoice carries: the job number's digits */
  paymentReference: string;
  issueDate: string;
  dueDate: string;
  daysOverdue: number;
  amount: number;
  credited: number;
  paid: number;
  /** Confirmed write-offs and bank charges together */
  writtenOff: number;
  leftToPay: number;
}

export interface StatementTotals {
  amount: number;
  credited: number;
  paid: number;
  writtenOff: number;
  leftToPay: number;
  /** Of what is left to pay, the part already overdue */
  overdue: number;
}

export interface Statement {
  customerId: string;
  customer: string;
  currency: string;
  /** The day it is made on (today) */
  asAt: string;
  lines: StatementLine[];
  totals: StatementTotals;
}

const money = (v: number): number => round2(v) || 0;

/** The currencies the customer still owes something in, most first then by code: one statement each. */
export function statementCurrencies(rows: readonly StatementRowInput[]): string[] {
  const owed = new Map<string, number>();
  for (const r of rows) if (isOwed(r)) owed.set(r.currency, money((owed.get(r.currency) ?? 0) + r.leftToPay));
  return [...owed.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/**
 * The statement of what the customer owes in `currency` as at `today`: every invoice still owed in it (unpaid or part
 * paid, something left to pay; one to refund or settled is left out), the longest overdue first.
 */
export function statementOf(rows: readonly StatementRowInput[], input: { customerId: string; customer: string; currency: string; today: string }): Statement {
  const lines: StatementLine[] = rows
    .filter((r) => r.currency === input.currency && isOwed(r))
    .map((r) => ({
      invoiceId: r.id,
      number: r.number,
      jobNumber: r.jobNumber,
      paymentReference: variableSymbol(r.jobNumber),
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      daysOverdue: daysOverdue(r.dueDate, input.today),
      amount: money(r.gross),
      credited: money(r.credited),
      paid: money(r.paid),
      writtenOff: money((r.writtenOff ?? 0) + (r.bankCharges ?? 0)),
      leftToPay: money(r.leftToPay),
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
  const sum = (pick: (l: StatementLine) => number, of: readonly StatementLine[] = lines) => money(of.reduce((s, l) => s + pick(l), 0));
  return {
    customerId: input.customerId,
    customer: input.customer,
    currency: input.currency,
    asAt: input.today,
    lines,
    totals: {
      amount: sum((l) => l.amount),
      credited: sum((l) => l.credited),
      paid: sum((l) => l.paid),
      writtenOff: sum((l) => l.writtenOff),
      leftToPay: sum((l) => l.leftToPay),
      overdue: sum(
        (l) => l.leftToPay,
        lines.filter((l) => l.daysOverdue > 0),
      ),
    },
  };
}

// ── CSV ──

const CSV_HEAD: Record<StatementLanguage, string[]> = {
  en: ["Invoice", "Job", "Payment reference", "Issued", "Due", "Days overdue", "Currency", "Amount", "Credited", "Paid", "Written off", "Left to pay"],
  cs: ["Faktura", "Zakázka", "Variabilní symbol", "Vystaveno", "Splatnost", "Dní po splatnosti", "Měna", "Částka", "Dobropisováno", "Zaplaceno", "Odepsáno", "Zbývá uhradit"],
};
const CSV_TOTAL: Record<StatementLanguage, string> = { en: "Total", cs: "Celkem" };

const plain = (n: number) => money(n).toFixed(2);

/** The statement as CSV rows: the headings, one line per invoice, then the total (amounts with VAT, 2 decimals). */
export function statementCsv(s: Statement, language: StatementLanguage): string[][] {
  return [
    CSV_HEAD[language],
    ...s.lines.map((l) => [
      l.number,
      l.jobNumber,
      l.paymentReference,
      l.issueDate,
      l.dueDate,
      String(l.daysOverdue),
      s.currency,
      plain(l.amount),
      plain(l.credited),
      plain(l.paid),
      plain(l.writtenOff),
      plain(l.leftToPay),
    ]),
    [CSV_TOTAL[language], "", "", "", "", "", s.currency, plain(s.totals.amount), plain(s.totals.credited), plain(s.totals.paid), plain(s.totals.writtenOff), plain(s.totals.leftToPay)],
  ];
}

// The same escaping as the web's CSV writer (web/src/lib/csv): every cell quoted, its quotes doubled, and text that a
// spreadsheet would run as a formula (=, +, -, @ first) given an apostrophe in front, a plain negative number kept.
const RUN_AS_FORMULA = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const csvCell = (value: string) => {
  const raw = String(value ?? "");
  const text = RUN_AS_FORMULA.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
};

/** The text of a CSV file, with the UTF-8 mark in front so Excel reads the diacritics. */
export function csvText(rows: readonly string[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

/** A name as a file name takes it: plain letters and digits, the rest a dash ("Gama, s.r.o." -> "Gama-s-r-o"). */
export function fileNamePart(name: string): string {
  const plainName = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return plainName || "customer";
}
