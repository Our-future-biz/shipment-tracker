import { addDays, formatDate } from "@/lib/date";
import { round2 } from "@/lib/money";

// Finance → Accounts Receivable → Month-end (step 7): what customers owed at the end of a day, per invoice in its own
// currency and in CZK at the invoice's own ČNB rate (its tax date). Revaluation stays in accounting.

/** The words beside the one CZK total on the page. */
export const CZK_TOTAL_LABEL = "at each invoice's own ČNB rate (its tax date)";

/**
 * How a payment taken back counts here (mock test council P8, the server's lib/receivables countsAt): one noted by
 * mistake never counts on any day; one reversed - a bank return or a refund - was paid, so it counts up to the day
 * before it went back.
 */
export const TAKEN_BACK_RULE =
  "A payment taken back as noted by mistake never counts, on any day; one reversed (a bank return or a refund) counts as paid up to the day before it went back.";

/** The month-end the page opens on: the last day of the month before today's (never after today). */
export function defaultMonthEndDay(today: string): string {
  return addDays(`${today.slice(0, 7)}-01`, -1);
}

/** The day asked for: a real day, never after today; anything else falls back to the default. */
export function monthEndDayOf(raw: string | null | undefined, today: string): string {
  const day = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return defaultMonthEndDay(today);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return defaultMonthEndDay(today);
  return day > today ? today : day;
}

/** What a CSV line needs from a row. */
export interface MonthEndCsvRow {
  number: string;
  customer: string;
  jobNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  gross: number;
  credited: number;
  paid: number;
  writtenOff: number;
  leftToPay: number;
  fxRate: number;
  leftToPayCzk: number;
  daysOverdue: number;
  carriedOver: boolean;
}

const fixed2 = (n: number) => round2(n).toFixed(2);

/**
 * The month-end as a CSV: one line per invoice, then one line per currency and the one CZK total, each saying what it
 * is. Figures as plain numbers (2 decimals, the rate as given), so a spreadsheet adds them up.
 */
export function monthEndCsv(
  day: string,
  rows: readonly MonthEndCsvRow[],
  totals: readonly { currency: string; amount: number }[],
  totalCzk: number,
): string[][] {
  const head = [
    "Invoice number",
    "Customer",
    "Job",
    "Issued",
    "Due",
    "Days overdue",
    "Currency",
    "Amount with VAT",
    "Credited",
    "Paid",
    "Written off",
    `Left to pay on ${formatDate(day)}`,
    "Rate (CZK per 1, ČNB on its tax date)",
    "Left to pay in CZK",
    "Note",
  ];
  const lines = rows.map((r) => [
    r.number,
    r.customer,
    r.jobNumber,
    formatDate(r.issueDate),
    formatDate(r.dueDate),
    String(r.daysOverdue),
    r.currency,
    fixed2(r.gross),
    fixed2(r.credited),
    fixed2(r.paid),
    fixed2(r.writtenOff),
    fixed2(r.leftToPay),
    String(r.fxRate),
    fixed2(r.leftToPayCzk),
    r.carriedOver ? "Includes a payment made before Accounts Receivable, day not known" : "",
  ]);
  const blank = (n: number) => Array.from({ length: n }, () => "");
  const totalLines = totals.map((t) => [`Total ${t.currency}`, ...blank(5), t.currency, ...blank(4), fixed2(t.amount), "", "", ""]);
  const czk = [`Total in CZK, ${CZK_TOTAL_LABEL}`, ...blank(12), fixed2(totalCzk), ""];
  return [head, ...lines, ...totalLines, czk];
}

/** The CSV's file name: accounts-receivable-month-end-2026-10-31.csv. */
export const monthEndFileName = (day: string): string => `accounts-receivable-month-end-${day}.csv`;
