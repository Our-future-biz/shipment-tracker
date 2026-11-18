import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import type { ReceivableItem } from "@/hooks/useReceivables";
import type { PillTone } from "@/components/Pill";
import { statusLabel, statusTone } from "@/lib/accountsReceivable";
import { convert, type Rates } from "@/lib/fx";
import { fmtMoney } from "@/lib/money";

// One definition of "owed", "overdue" and the aging buckets for every tile, bar, column and attention row of the
// customer's page - the same truth as Finance → Accounts Receivable (Council Outlay 10, D19):
// - an invoice issued in Invoicing counts with what is left to pay on it, overdue and aged as the server says
//   (by the day in Prague, never the viewer's clock);
// - a row typed by hand into the customer's list counts with its amount while it is not settled, overdue when it
//   is marked so or its due day has passed on the business day (Prague).
// The customer's list also holds a copy of every issued invoice and credit note; those copies are not counted
// again (Accounts Receivable's rows already net the credit notes in).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export interface AgingBucket {
  key: string;
  label: string;
  amount: number;
  count: number;
  // Buckets old enough to be shown as a problem.
  critical: boolean;
}

// Every amount of the summary is in the customer's currency (the credit limit's currency):
// invoices in another currency are converted at today's ČNB rates.
export interface InvoiceSummary {
  outstanding: number;
  // Owed and not yet due.
  openAmount: number;
  openCount: number;
  overdueAmount: number;
  overdueCount: number;
  // Whole days the oldest overdue invoice is past its due day; 0 when none is (or only marked so by hand).
  oldestOverdueDays: number;
  aging: AgingBucket[];
  // Owed amounts as invoiced, per currency (customer's currency first).
  byCurrency: { currency: string; amount: number; count: number }[];
  // Owed in a currency without an exchange rate: left out of every total above.
  unconverted: { currency: string; amount: number; count: number }[];
}

// The customer's currency and today's rates the totals are converted with.
export interface InvoiceFx {
  currency: string;
  rates: Rates;
}

/** What the customer owes, from its two sources. */
export interface CustomerLedger {
  // The invoices issued in Invoicing and billed to the customer, as Accounts Receivable reads them.
  issued: readonly ReceivableItem[];
  // The rows typed by hand into the customer's list (handTyped()).
  typed: readonly InvoiceItem[];
}

/**
 * Why the `unconverted` invoices are left out of the totals: ČNB publishes no rate for their currency -
 * or, when today's rates could not be loaded (only CZK is known then), that they could not be.
 */
export function unconvertedReason(unconverted: InvoiceSummary["unconverted"], ratesUnavailable: boolean): string {
  return ratesUnavailable
    ? "Today's exchange rates could not be loaded"
    : `ČNB publishes no rate for ${unconverted.map((u) => u.currency).join(", ")}`;
}

const numberKey = (n: string) => n.trim().toUpperCase();

/**
 * The rows of the customer's list that were typed by hand. A row Invoicing posted is left out - marked so, or
 * (an older copy, posted before rows were marked) its number is one of the issued invoices or their credit notes:
 * Accounts Receivable's row says what is owed on it.
 */
export function handTyped(invoices: readonly InvoiceItem[], issued: readonly ReceivableItem[]): InvoiceItem[] {
  const issuedNumbers = new Set(issued.flatMap((r) => [r.number, ...r.creditNoteNumbers]).map(numberKey));
  return invoices.filter((i) => i.source !== "invoicing" && !issuedNumbers.has(numberKey(i.invoiceNumber)));
}

/** An issued invoice something is still owed on (the server's isOwed). */
export function isOwedIssued(row: Pick<ReceivableItem, "status" | "leftToPay">): boolean {
  return row.leftToPay > 0 && (row.status === "unpaid" || row.status === "part_paid");
}

/**
 * Nothing more is owed on a typed row: paid, cancelled by a credit note, or cancelled on its issue day (it is
 * issued again corrected under a new number, which is the one owed).
 */
export function isSettled(invoice: InvoiceItem): boolean {
  return invoice.status === "Paid" || invoice.status === "Credited" || invoice.status === "Cancelled";
}

/**
 * How a typed row's status (effectiveStatus) is shown: in Accounts Receivable's words and tones (D3), so the stored
 * "Open" reads "Unpaid" - never "Open" as a status. "Overdue" stays: these rows have no overdue mark of their own.
 */
export function typedStatusMark(status: InvoiceItem["status"]): { label: string; tone: PillTone } {
  switch (status) {
    case "Open":
      return { label: statusLabel("unpaid"), tone: statusTone("unpaid") };
    case "Overdue":
      return { label: "Overdue", tone: "red" };
    case "Paid":
      return { label: statusLabel("paid"), tone: statusTone("paid") };
    case "Credited":
      return { label: statusLabel("credited"), tone: statusTone("credited") };
    case "Cancelled":
      return { label: statusLabel("cancelled"), tone: statusTone("cancelled") };
    default:
      return { label: String(status), tone: "slate" };
  }
}

/** An issued invoice's left to pay, as Accounts Receivable's drawer says it: below 0 is what is to be refunded. */
export const leftToPayText = (leftToPay: number, currency: string): string =>
  leftToPay < 0 ? `${fmtMoney(-leftToPay, currency)} to refund` : fmtMoney(leftToPay, currency);

/** Whole days from one calendar day (YYYY-MM-DD) to another; null when either can't be read. */
function daysBetween(from: string, to: string): number | null {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  const diff = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Number.isFinite(diff) ? Math.round(diff / DAY_MS) : null;
}

/**
 * Whole days a typed row is past its due day on the business day `today` (Prague, lib/date businessToday);
 * 0 when settled, not yet due, or the date is missing/unreadable.
 */
export function daysOverdue(invoice: InvoiceItem, today: string): number {
  if (isSettled(invoice)) return 0;
  const days = daysBetween(invoice.dueDate.slice(0, 10), today);
  return days === null ? 0 : Math.max(0, days);
}

/** A typed row is overdue from the day after its due day, or when it is marked so by hand - whichever comes first. */
export function isOverdue(invoice: InvoiceItem, today: string): boolean {
  return !isSettled(invoice) && (invoice.status === "Overdue" || daysOverdue(invoice, today) > 0);
}

// The status to display: an unsettled typed row past its due day reads "Overdue" even if nobody re-labelled it.
export function effectiveStatus(invoice: InvoiceItem, today: string): InvoiceItem["status"] {
  return isOverdue(invoice, today) ? "Overdue" : invoice.status;
}

const AGING_LIMITS: { key: string; label: string; maxDays: number; critical: boolean }[] = [
  { key: "current", label: "Current", maxDays: 0, critical: false },
  { key: "1-30", label: "1–30 days", maxDays: 30, critical: false },
  { key: "31-60", label: "31–60 days", maxDays: 60, critical: false },
  { key: "61-90", label: "61–90 days", maxDays: 90, critical: true },
  { key: "90+", label: "90+ days", maxDays: Infinity, critical: true },
];

/** One thing owed, from either source: what the summary adds up. */
interface Owed {
  currency: string;
  amount: number;
  overdue: boolean;
  days: number;
  bucket: string | null;
}

function owedEntries(ledger: CustomerLedger, fx: InvoiceFx, today: string): Owed[] {
  const owed: Owed[] = [];
  for (const row of ledger.issued) {
    if (!isOwedIssued(row)) continue;
    const overdue = row.marks.includes("overdue");
    owed.push({ currency: row.currency || fx.currency, amount: row.leftToPay, overdue, days: overdue ? row.daysOverdue : 0, bucket: row.agingBucket });
  }
  for (const invoice of ledger.typed) {
    if (isSettled(invoice)) continue;
    const overdue = isOverdue(invoice, today);
    // An invoice typed without a currency was entered in the customer's currency.
    owed.push({ currency: invoice.currency || fx.currency, amount: invoice.amount ?? 0, overdue, days: daysOverdue(invoice, today), bucket: null });
  }
  return owed;
}

/**
 * The customer's figures: the issued invoices' left to pay plus the open typed rows, per currency as invoiced and
 * converted into the customer's currency at today's rates. `today` is the business day (Prague).
 */
export function summarizeInvoices(ledger: CustomerLedger, fx: InvoiceFx, today: string): InvoiceSummary {
  const aging: AgingBucket[] = AGING_LIMITS.map(({ key, label, critical }) => ({ key, label, critical, amount: 0, count: 0 }));
  const summary: InvoiceSummary = {
    outstanding: 0, openAmount: 0, openCount: 0, overdueAmount: 0, overdueCount: 0, oldestOverdueDays: 0, aging, byCurrency: [], unconverted: [],
  };
  const byCurrency = new Map<string, { amount: number; count: number }>();
  const unconverted = new Map<string, { amount: number; count: number }>();
  const add = (map: typeof byCurrency, currency: string, amount: number) => {
    const entry = map.get(currency) ?? { amount: 0, count: 0 };
    map.set(currency, { amount: entry.amount + amount, count: entry.count + 1 });
  };

  for (const owed of owedEntries(ledger, fx, today)) {
    add(byCurrency, owed.currency, owed.amount);
    const amount = convert(owed.amount, owed.currency, fx.currency, fx.rates);
    if (amount === null) {
      add(unconverted, owed.currency, owed.amount);
      continue;
    }
    summary.outstanding += amount;
    if (owed.overdue) {
      summary.overdueAmount += amount;
      summary.overdueCount += 1;
      summary.oldestOverdueDays = Math.max(summary.oldestOverdueDays, owed.days);
    } else {
      summary.openAmount += amount;
      summary.openCount += 1;
    }
    // The server's bucket for an issued invoice. A typed row marked overdue by hand with no elapsed days (no due
    // date, or one not yet passed) has no known age, so it goes to the youngest past-due bucket - "Current"
    // always equals the not-yet-due tile.
    const days = Math.max(owed.days, owed.overdue ? 1 : 0);
    const index = owed.bucket ? AGING_LIMITS.findIndex((limit) => limit.key === owed.bucket) : -1;
    const bucket = aging[index >= 0 ? index : AGING_LIMITS.findIndex((limit) => days <= limit.maxDays)];
    if (bucket) {
      bucket.amount += amount;
      bucket.count += 1;
    }
  }

  const ordered = (map: typeof byCurrency) =>
    [...map.entries()]
      .map(([currency, v]) => ({ currency, ...v }))
      .sort((a, b) => (a.currency === fx.currency ? -1 : b.currency === fx.currency ? 1 : a.currency.localeCompare(b.currency)));
  summary.byCurrency = ordered(byCurrency);
  summary.unconverted = ordered(unconverted);
  return summary;
}
