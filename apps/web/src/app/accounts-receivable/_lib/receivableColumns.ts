import { AGING_LABEL, REMINDER_LEVEL_LABEL, statusLabel } from "@/lib/accountsReceivable";
import { formatDate } from "@/lib/date";
import { tableModel, type TableModel } from "@/lib/tableModel";
import {
  amountText,
  isOverLimit,
  paidText,
  passesCheck,
  RECEIVABLE_CHECKS,
  type LimitState,
  type ReceivableCheck,
  type ReceivableCustomer,
  type ReceivableRow,
} from "./receivables";

// Finance → Accounts Receivable's Filter and Columns, the bar Accounts Payable and Invoicing have (the page: "the same
// bar … Filter and Columns, saved filters and columns"). The generic model is @/lib/tableModel; only the columns and
// the operator's checks of this page are here, each table under a scope of its own, so nothing is shared with Accounts
// Payable or Invoicing. The mock's columns show at first; the optional ones (DUZP, CZK, Credited, the people, the terms,
// the last reminder, the age) are picked in Columns. Pure, so it is unit-tested.

const day = (v: string | null | undefined) => (v ? formatDate(v) : "");

/** The scope of the invoices table's columns and saved sets (new with this page). */
export const RECEIVABLE_SCOPE = "accounts-receivable";
export const CUSTOMER_SCOPE = "accounts-receivable-customers";

// The table's order (user council A5): at 1440 px the mock's ten columns were 1,566 px in a 1,114 px box, and Status,
// Currency and Paid were off-screen. So Status comes right after the number, and Issued after Paid - Due is the day that
// is chased. Only this order moved: a saved set of columns is a set (normalizeColumns puts it in this order), so every
// saved set and template still shows what it showed.
export const RECEIVABLE_COLUMNS = [
  { key: "number", title: "Invoice number" },
  { key: "status", title: "Status", options: ["Unpaid", "Part paid", "Paid", "Written off", "Credited", "Cancelled"] },
  { key: "customer", title: "Customer" },
  { key: "job", title: "Job" },
  { key: "due", title: "Due" },
  { key: "gross", title: "Amount with VAT" },
  { key: "left", title: "Left to pay" },
  { key: "currency", title: "Currency" },
  { key: "paid", title: "Paid" },
  { key: "issued", title: "Issued" },
  // Off at first (the page): picked in Columns.
  { key: "duzp", title: "DUZP" },
  { key: "czk", title: "Amount in CZK" },
  { key: "credited", title: "Credited" },
  { key: "salesOwner", title: "Sales Owner" },
  { key: "pic", title: "Person in Charge" },
  { key: "issuedBy", title: "Issued by" },
  { key: "terms", title: "Payment terms" },
  { key: "reminder", title: "Last reminder" },
  { key: "aging", title: "Aging", options: Object.values(AGING_LABEL) },
];

/** The columns shown at first: the mock's; one stable array, as useColumnPrefs needs. */
export const RECEIVABLE_DEFAULT_COLUMNS: string[] = ["number", "status", "customer", "job", "due", "gross", "left", "currency", "paid", "issued"];

const RECEIVABLE_VIEW = { scope: RECEIVABLE_SCOPE, defaults: RECEIVABLE_DEFAULT_COLUMNS };

/** A cell's text in the invoices table, as the row shows it (the Filter panel matches it). */
export function receivableCellText(r: ReceivableRow, key: string): string {
  switch (key) {
    case "number":
      return [r.number, ...r.creditNoteNumbers].join(" ");
    case "customer":
      return r.customer;
    case "job":
      return r.jobNumber;
    case "issued":
      return day(r.issueDate);
    case "due":
      return [day(r.dueDate), r.daysOverdue > 0 ? `${r.daysOverdue} ${r.daysOverdue === 1 ? "day" : "days"} overdue` : ""].filter(Boolean).join(" · ");
    case "gross":
      return amountText(r.gross, r.currency);
    case "left":
      return amountText(r.leftToPay, r.currency);
    case "currency":
      return r.currency;
    case "status":
      return statusLabel(r.status);
    case "paid":
      return paidText(r);
    case "duzp":
      return day(r.duzp);
    case "czk":
      return amountText(r.grossCzk, "CZK");
    case "credited":
      return r.credited ? amountText(r.credited, r.currency) : "";
    case "salesOwner":
      return r.salesOwner;
    case "pic":
      return [r.personInCharge, r.holidayCover].filter(Boolean).join(" ");
    case "issuedBy":
      return r.issuedBy;
    case "terms":
      return r.paymentTerms;
    case "reminder":
      return r.reminderLevel > 0 ? `${REMINDER_LEVEL_LABEL[Math.min(r.reminderLevel, 3) as 1 | 2 | 3]} ${day(r.lastRemindedOn)}`.trim() : "";
    case "aging":
      return r.agingBucket ? AGING_LABEL[r.agingBucket] : "";
    default:
      return "";
  }
}

/**
 * The invoices table's model. Its checks read today (Prague's day, as the server's `today` says it), so the model is
 * made per day; its column view keeps one stable defaults array, so the saved columns are read once. "Not reminded by
 * the app" reads the day the automatic reminders start (the server's autoRemindersSince; null: off or not set).
 */
export function receivableTable(today: string, autoRemindersSince: string | null = null): TableModel<ReceivableRow, ReceivableCheck> {
  const m = tableModel<ReceivableRow, ReceivableCheck>({
    scope: RECEIVABLE_SCOPE,
    columns: RECEIVABLE_COLUMNS,
    first: "number",
    checks: RECEIVABLE_CHECKS,
    checksTitle: "Show only",
    cellText: receivableCellText,
    passesCheck: (r, check) => passesCheck(r, check, today, autoRemindersSince),
  });
  return { ...m, view: RECEIVABLE_VIEW };
}

// ── By customer ──

/** A By customer row with its limit worked out (the one converted figure, @/lib/fx), so the Filter panel can check it. */
export type CustomerRow = ReceivableCustomer & { key: string; limit: LimitState | null };

export const customerRowsOf = (rows: readonly ReceivableCustomer[], limits: ReadonlyMap<string, LimitState>): CustomerRow[] =>
  rows.map((c) => ({ ...c, key: `${c.customerId}|${c.currency}`, limit: limits.get(c.customerId) ?? null }));

export type CustomerCheck = "over_limit" | "over_60";

export const CUSTOMER_CHECKS: { key: CustomerCheck; label: string; tip: string }[] = [
  { key: "over_limit", label: "Over limit", tip: "What the customer owes in all, converted at today's rates, is above its credit limit" },
  { key: "over_60", label: "Owes over 60 days", tip: "Something is more than 60 days past its due day" },
];

export function customerCellText(c: CustomerRow, key: string): string {
  const figure = (v: number) => (v ? amountText(v, c.currency) : "");
  switch (key) {
    case "customer":
      return isOverLimit(c.limit ?? undefined) ? `${c.customer} Over limit` : c.customer;
    case "salesOwner":
      return c.salesOwner;
    case "currency":
      return c.currency;
    case "unpaid":
      return figure(c.unpaid);
    case "current":
      return figure(c.current);
    case "d1to30":
      return figure(c.d1to30);
    case "d31to60":
      return figure(c.d31to60);
    case "d61to90":
      return figure(c.d61to90);
    case "d90plus":
      return figure(c.d90plus);
    case "oldestDue":
      return day(c.oldestDue);
    case "invoices":
      return String(c.invoices);
    default:
      return "";
  }
}

export const CUSTOMER_TABLE = tableModel<CustomerRow, CustomerCheck>({
  scope: CUSTOMER_SCOPE,
  columns: [
    { key: "customer", title: "Customer" },
    { key: "salesOwner", title: "Sales Owner" },
    { key: "currency", title: "Currency" },
    { key: "unpaid", title: "Unpaid" },
    { key: "current", title: AGING_LABEL.current },
    { key: "d1to30", title: AGING_LABEL["1-30"] },
    { key: "d31to60", title: AGING_LABEL["31-60"] },
    { key: "d61to90", title: AGING_LABEL["61-90"] },
    { key: "d90plus", title: AGING_LABEL["90+"] },
    { key: "oldestDue", title: "Oldest due" },
    { key: "invoices", title: "Invoices" },
  ],
  first: "customer",
  checks: CUSTOMER_CHECKS,
  checksTitle: "Show only",
  cellText: customerCellText,
  passesCheck: (c, check) => (check === "over_limit" ? isOverLimit(c.limit ?? undefined) : c.d61to90 + c.d90plus > 0),
});
