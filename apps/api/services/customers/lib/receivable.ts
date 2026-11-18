import type { InvoiceStatus, ReminderContact } from "../interfaces/interfaces";

// The customers' side of Finance → Accounts Receivable (Council Outlay 10): what the customer's invoice list counts as
// owed, how Accounts Receivable's word on an invoice changes its entry, and whom a reminder goes to. Pure rules,
// tested in tests/receivable.test.ts.

/** The answer to an edit or delete of an entry Invoicing posted (D9). */
export const POSTED_INVOICE_REFUSAL =
  "This invoice was issued in Invoicing: it is changed only by a credit note, and a payment is noted on Finance → Accounts Receivable";

/** The statuses that still count as owed. */
export const OWED_STATUSES: readonly InvoiceStatus[] = ["Open", "Overdue"];

const cents = (n: number) => Math.round(n * 100);

/** An entry of the customer's invoice list, as far as what is owed goes. */
export interface OwedEntry {
  customerId: string;
  currency: string;
  amount: number;
  /** Null until Accounts Receivable sends it: the amount counts until then. */
  leftToPay: number | null;
  status: InvoiceStatus;
  dueDate: string | null;
}

/** What an entry still asks the customer for: left to pay when Accounts Receivable said so, else its amount. */
export const owedOf = (e: Pick<OwedEntry, "amount" | "leftToPay">): number => e.leftToPay ?? e.amount;

/**
 * Overdue: still owed (more than nothing - a partial credit note's minus entry never is) and marked Overdue, or Open
 * past its due day (`today` is the Prague business day).
 */
export function isOverdue(e: OwedEntry, today: string): boolean {
  if (!(owedOf(e) > 0)) return false;
  if (e.status === "Overdue") return true;
  return e.status === "Open" && !!e.dueDate && e.dueDate < today;
}

export interface OwedSum {
  customerId: string;
  currency: string;
  /** In `currency`, never converted; below 0 when credit notes or payments are more than the invoices. */
  amount: number;
  overdue: number;
  oldestDue: string | null;
}

/**
 * What each customer owes per currency: the unpaid entries (Open / Overdue) summed by what is left to pay, a partial
 * credit note netted into its invoice, and how many are overdue with the oldest due day among them. A currency in
 * which nothing is owed and nothing is overdue is left out.
 */
export function owedByCustomer(entries: OwedEntry[], today: string): OwedSum[] {
  const sums = new Map<string, { customerId: string; currency: string; cents: number; overdue: number; oldestDue: string | null }>();
  for (const e of entries) {
    if (!OWED_STATUSES.includes(e.status)) continue;
    const key = `${e.customerId}\u0000${e.currency}`;
    const sum = sums.get(key) ?? { customerId: e.customerId, currency: e.currency, cents: 0, overdue: 0, oldestDue: null };
    sum.cents += cents(owedOf(e));
    if (isOverdue(e, today)) {
      sum.overdue += 1;
      const due = e.dueDate ?? null;
      if (due && (!sum.oldestDue || due < sum.oldestDue)) sum.oldestDue = due;
    }
    sums.set(key, sum);
  }
  return [...sums.values()]
    .filter((s) => s.cents !== 0 || s.overdue > 0)
    .map((s) => ({ customerId: s.customerId, currency: s.currency, amount: s.cents / 100, overdue: s.overdue, oldestDue: s.oldestDue }));
}

/** An invoice's own status in Invoicing. */
export type InvoicingStatus = "issued" | "credited" | "cancelled";
export const INVOICING_STATUSES: readonly InvoicingStatus[] = ["issued", "credited", "cancelled"];

/** What Accounts Receivable says of an invoice (the receivable_state follow-up). */
export interface ReceivableWord {
  leftToPay: number;
  lastPaidOn: string | null;
  settled: boolean;
  /** The invoice's own status in Invoicing (absent: issued). */
  invoiceStatus?: InvoicingStatus;
}

/** An entry of the customer's list as Accounts Receivable's word reads it. */
export interface ReceivableEntry {
  status: InvoiceStatus;
  /** Null until Accounts Receivable first wrote to the entry. */
  leftToPay: number | string | null;
}

/**
 * The invoice's entry after Accounts Receivable's word: left to pay and the last payment day as sent. A Credited or
 * Cancelled entry is never touched (null). A credited invoice's entry becomes Credited and a cancelled one's Cancelled
 * (never Paid). Otherwise Paid when it is settled and still Open or Overdue, and back to Open when a take-back leaves it
 * unsettled and it says Paid - only when Accounts Receivable wrote to the entry before: an old Paid it never wrote to is
 * left as it is (null), so the carry-over still finds it.
 */
export function receivablePatch(entry: ReceivableEntry, word: ReceivableWord): { status: InvoiceStatus; leftToPay: number; paidOn: string | null } | null {
  const status = entry.status;
  if (status === "Credited" || status === "Cancelled") return null;
  const figures = { leftToPay: cents(word.leftToPay) / 100, paidOn: word.lastPaidOn };
  if (word.invoiceStatus === "credited") return { status: "Credited", ...figures };
  if (word.invoiceStatus === "cancelled") return { status: "Cancelled", ...figures };
  if (!word.settled && status === "Paid") return entry.leftToPay === null ? null : { status: "Open", ...figures };
  return { status: word.settled && OWED_STATUSES.includes(status) ? "Paid" : status, ...figures };
}

/** A contact as the reminder choice reads it. */
export interface ReminderCandidate {
  id: string;
  name: string;
  email: string;
  role: string;
  isMain: boolean;
  createdAt: Date;
}

const REMINDER_ROLES = ["Accounts payable", "Finance / Accounting"] as const;

/**
 * Whom a payment reminder goes to (D17): the contact with the role Accounts payable, else Finance / Accounting, else the
 * main contact - each only with an e-mail; null when there is none. Among several of a role the main contact, then the
 * oldest, so the choice does not change from one reading to the next.
 */
export function reminderContact(contacts: ReminderCandidate[]): ReminderContact | null {
  const withEmail = contacts
    .filter((c) => c.email.trim() !== "")
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const pick = REMINDER_ROLES.map((role) => withEmail.find((c) => c.role === role)).find(Boolean) ?? withEmail.find((c) => c.isMain);
  return pick ? { name: pick.name, email: pick.email.trim(), role: pick.role } : null;
}

/** Payment terms that ask for payment before the service (the snapshot rule Accounts Receivable uses). */
export const isPrepayment = (paymentTerms: string): boolean => /prepay/i.test(paymentTerms);
