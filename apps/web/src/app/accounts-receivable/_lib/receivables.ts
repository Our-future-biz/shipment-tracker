import type { interfaces } from "@/lib/api/client";
import { AGING_LABEL, markChips, REMINDER_LEVEL_LABEL, statusLabel } from "@/lib/accountsReceivable";
import { addDays, businessDayOf, formatDate } from "@/lib/date";
import { fold } from "@/lib/fold";
import { convert, type Rates } from "@/lib/fx";
import { formatAmount, money, parseMoney, round2 } from "@/lib/money";
import type { CheckDef } from "@/lib/tableModel";

// Finance → Accounts Receivable (Council Outlay 10, D1–D26 as recommended, 18 Nov 2026): which tab an invoice is in,
// how the bar's filters and checks match it, the "Over limit" mark of By customer, what the drawer may offer, and how
// the list is exported - kept pure so it can be tested on its own. The words and marks come from
// @/lib/accountsReceivable, so one invoice reads the same everywhere. The server decides every action again; these
// rules only keep the page from offering what it would refuse. Amounts are in the invoice's currency, never converted
// nor added up across currencies; the one converted figure is the credit-limit comparison (the Rules, "Amounts").

export type ReceivableRow = interfaces.ReceivableItem;
export type ReceivableCustomer = interfaces.ReceivableCustomerRow;
export type ReceivableCounts = interfaces.ReceivablesResponse["counts"];
export type ReceivablePeriod = interfaces.ReceivablePeriod;

// ── Tabs (D1, D7) ──

export type ReceivableTab = "unpaid" | "overdue" | "paid" | "credited" | "written_off" | "all" | "promised" | "disputed" | "customers";

export const RECEIVABLE_TABS: { key: ReceivableTab; label: string; count: keyof ReceivableCounts; dividerBefore?: boolean; hiddenWhenNone?: boolean }[] = [
  // The working list, so the default (the page).
  { key: "unpaid", label: "Unpaid", count: "unpaid" },
  { key: "overdue", label: "Overdue", count: "overdue" },
  { key: "paid", label: "Paid", count: "paid" },
  { key: "credited", label: "Credited & cancelled", count: "creditedCancelled" },
  // Step 7: closed by a confirmed write-off, not paid by the customer; shown only when there is one.
  { key: "written_off", label: "Written off", count: "writtenOff", hiddenWhenNone: true },
  { key: "all", label: "All", count: "all" },
  { key: "promised", label: "Promised", count: "promised" },
  { key: "disputed", label: "Disputed", count: "disputed" },
  // Not invoices: one row per customer and currency, after a divider as Expected is in Accounts Payable (D7).
  { key: "customers", label: "By customer", count: "byCustomer", dividerBefore: true },
];

export const DEFAULT_TAB: ReceivableTab = "unpaid";

export const isReceivableTab = (v: string | null): v is ReceivableTab => RECEIVABLE_TABS.some((t) => t.key === v);

export const tabLabel = (tab: ReceivableTab): string => RECEIVABLE_TABS.find((t) => t.key === tab)?.label ?? tab;

/** The tab's count, as the server counts the rows it sent. */
export const tabCount = (tab: ReceivableTab, counts: ReceivableCounts): number => counts[RECEIVABLE_TABS.find((t) => t.key === tab)!.count] ?? 0;

/**
 * The tabs the bar shows: Written off only when an invoice is written off (or while it is the tab open, so a link to
 * it never lands on a tab that is not there). Before the counts are in, it is left out.
 */
export const visibleTabs = (counts: ReceivableCounts | undefined, active: ReceivableTab): typeof RECEIVABLE_TABS =>
  RECEIVABLE_TABS.filter((t) => !t.hiddenWhenNone || t.key === active || (!!counts && tabCount(t.key, counts) > 0));

/** Still owed: unpaid or part paid, with something left to pay (the server's isOwed). */
export const isOwed = (r: Pick<ReceivableRow, "status" | "leftToPay">): boolean => r.leftToPay > 0 && (r.status === "unpaid" || r.status === "part_paid");

/**
 * Whether an invoice belongs in a tab, as the server counts them (services/receivable list): Unpaid holds every one
 * still owed, Overdue those past their due day, Paid and Credited & cancelled by their status, Promised and Disputed by
 * their marks. By customer lists no invoices.
 */
export function inTab(r: ReceivableRow, tab: ReceivableTab): boolean {
  switch (tab) {
    case "unpaid":
      return isOwed(r);
    case "overdue":
      return r.marks.includes("overdue");
    case "paid":
      return r.status === "paid";
    case "credited":
      return r.status === "credited" || r.status === "cancelled";
    case "written_off":
      return r.status === "written_off";
    case "all":
      return true;
    case "promised":
      return r.marks.includes("promised");
    case "disputed":
      return r.marks.includes("disputed");
    default:
      return false;
  }
}

/** Tabs that always hold everything owed, whatever the period: the period only reaches the invoices no longer owed. */
export const PERIOD_FREE_TABS: readonly ReceivableTab[] = ["unpaid", "overdue", "customers"];

export const PERIOD_OPTIONS: { value: ReceivablePeriod; label: string; words: string }[] = [
  { value: "90d", label: "Last 90 days", words: "issued in the last 90 days" },
  { value: "12m", label: "Last 12 months", words: "issued in the last 12 months" },
  { value: "all", label: "All time", words: "issued at any time" },
];

export const isPeriod = (v: string | null): v is ReceivablePeriod => PERIOD_OPTIONS.some((p) => p.value === v);

export const periodWords = (p: ReceivablePeriod): string => PERIOD_OPTIONS.find((o) => o.value === p)?.words ?? "";

/** What the table says when it shows nothing: why, in the user's words (as Accounts Payable says it). */
export function emptyText(input: { tab: ReceivableTab; period: ReceivablePeriod; filtered: boolean; loading: boolean; failed: boolean }): string {
  if (input.failed) return "Could not load the customer invoices.";
  if (input.loading) return "Loading the invoices…";
  if (input.filtered) return "Nothing matches these filters.";
  const when = periodWords(input.period);
  switch (input.tab) {
    case "unpaid":
      return "No invoice is unpaid: nothing is left to collect.";
    case "overdue":
      return "No invoice is overdue.";
    case "paid":
      return `No paid invoice ${when}.`;
    case "credited":
      return `No credited or cancelled invoice ${when}.`;
    case "written_off":
      return `No written-off invoice ${when}.`;
    case "promised":
      return "No invoice with a promise to pay.";
    case "disputed":
      return "No disputed invoice.";
    case "customers":
      return "No customer owes anything.";
    default:
      return `No invoice ${when}, and none unpaid.`;
  }
}

// ── The bar's filters ──

export interface ReceivableFilters {
  search: string;
  /** Jobs the user is the Person in Charge or Holiday Cover of (the Accounts Payable rule, D5) */
  mine: boolean;
  /** Customers the user is the Sales Owner of (D18, build step 5) */
  myCustomers: boolean;
  /** The customer chosen (By customer's row click sets it); "" for any */
  customerId: string;
}

export const NO_FILTERS: ReceivableFilters = { search: "", mine: false, myCustomers: false, customerId: "" };

export const isFiltered = (f: ReceivableFilters): boolean => !!f.search.trim() || f.mine || f.myCustomers || !!f.customerId;

const hasWords = (haystack: string, search: string) => {
  const words = fold(search).split(/\s+/).filter(Boolean);
  const text = fold(haystack);
  return words.every((w) => text.includes(w));
};

/** What the search reads of an invoice: the customer, its number, the job, and the numbers of its credit notes (D1). */
export const searchText = (r: ReceivableRow): string => [r.customer, r.number, r.jobNumber, ...r.creditNoteNumbers].join(" ");

/** Search, My jobs, My customers and the customer. */
export function matchesFilters(r: ReceivableRow, f: ReceivableFilters): boolean {
  if (f.customerId && r.customerId !== f.customerId) return false;
  if (f.mine && !r.mine) return false;
  if (f.myCustomers && !r.myCustomer) return false;
  return !f.search.trim() || hasWords(searchText(r), f.search);
}

/**
 * A By customer row against the same bar: the customer, the search on its name or Sales Owner, and My customers by the
 * customers whose invoices say the user is their Sales Owner. My jobs is about jobs, not customers: it narrows nothing here.
 */
export function customerMatches(c: ReceivableCustomer, f: ReceivableFilters, myCustomerIds: ReadonlySet<string>): boolean {
  if (f.customerId && c.customerId !== f.customerId) return false;
  if (f.myCustomers && !myCustomerIds.has(c.customerId)) return false;
  return !f.search.trim() || hasWords(`${c.customer} ${c.salesOwner}`, f.search);
}

/** The customers the user is the Sales Owner of, as the invoices say it. */
export const myCustomerIdsOf = (rows: readonly ReceivableRow[]): Set<string> => new Set(rows.filter((r) => r.myCustomer).map((r) => r.customerId));

/** The customers to pick from, by name: those of the invoices and those of By customer. */
export function customerOptions(rows: readonly ReceivableRow[], customers: readonly ReceivableCustomer[] = []): { value: string; label: string }[] {
  const by = new Map<string, string>();
  for (const r of rows) if (r.customerId && !by.has(r.customerId)) by.set(r.customerId, r.customer || "—");
  for (const c of customers) if (c.customerId && !by.has(c.customerId)) by.set(c.customerId, c.customer || "—");
  return [...by.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

// ── The operator's checks: rows of the Filter panel, so a saved filter set keeps them ──

export type ReceivableCheck = "due_week" | "over_60" | "prepayment" | "to_refund" | "promise_passed" | "not_auto_reminded";

export const RECEIVABLE_CHECKS: CheckDef<ReceivableCheck>[] = [
  { key: "due_week", label: "Due this week", tip: "Still owed, due today or in the next 7 days" },
  { key: "over_60", label: "Over 60 days overdue", tip: "Still owed, more than 60 days past its due day" },
  { key: "prepayment", label: "Prepayment", tip: "The customer's terms are prepayment: due on the day it was issued" },
  { key: "to_refund", label: "To refund", tip: "Credited after it was paid: we owe the customer the difference" },
  // Mock test council m6: the broken promises, to chase again.
  { key: "promise_passed", label: "Promise passed", tip: "Still owed after the day the customer promised to pay by" },
  // Mock test council P18: what the automatic reminders never take, to chase by hand.
  {
    key: "not_auto_reminded",
    label: "Not reminded by the app",
    tip: "Still owed and due before the day the app's automatic reminders started (all of them while those are off): chase these by hand",
  },
];

/**
 * Not reminded by the app (P18): still owed and due before the day the automatic reminders start - every owed one while
 * they are off or no day is set yet (`since` null). The app's own rule moves a due day on a weekend or holiday to the
 * next working day; this list does not, so an invoice due on the weekend just before the day may still be reminded.
 */
export const notAutoReminded = (r: Pick<ReceivableRow, "status" | "leftToPay" | "dueDate">, since: string | null | undefined): boolean =>
  isOwed(r) && (!since || r.dueDate < since);

export const checkLabel = (key: ReceivableCheck): string => RECEIVABLE_CHECKS.find((c) => c.key === key)!.label;

/** The checks a KPI tile puts on when it opens its tab (Due this week, Over 60 days). */
export const TILE_CHECKS: readonly ReceivableCheck[] = ["due_week", "over_60"];

/**
 * The checks to switch when a tile opens its tab, so the table lists what the tile counts: the tile's own check goes
 * on, and every other tile's check that is on goes off - the checks must all hold, and Over 60 days with Due this week
 * would list nothing. A check no tile puts on (Prepayment, To refund) stays as the user set it.
 */
export function tileCheckToggles(isOn: (check: ReceivableCheck) => boolean, own: ReceivableCheck | null): ReceivableCheck[] {
  return TILE_CHECKS.filter((c) => (c === own ? !isOn(c) : isOn(c)));
}

/** Due this week, as the tile counts it: still owed, due from today to 7 days on (Prague's day, the server's `today`). */
export const isDueThisWeek = (r: Pick<ReceivableRow, "status" | "leftToPay" | "dueDate">, today: string): boolean =>
  isOwed(r) && r.dueDate >= today && r.dueDate <= addDays(today, 7);

/** Over 60 days, as the tile counts it: still owed and more than 60 days past due. */
export const isOver60 = (r: Pick<ReceivableRow, "status" | "leftToPay" | "daysOverdue">): boolean => isOwed(r) && r.daysOverdue > 60;

export function passesCheck(r: ReceivableRow, check: ReceivableCheck, today: string, autoRemindersSince: string | null = null): boolean {
  switch (check) {
    case "due_week":
      return isDueThisWeek(r, today);
    case "over_60":
      return isOver60(r);
    case "prepayment":
      return r.marks.includes("prepayment");
    case "to_refund":
      return r.marks.includes("to_refund");
    case "promise_passed":
      return isOwed(r) && r.marks.includes("promise_broken");
    case "not_auto_reminded":
      return notAutoReminded(r, autoRemindersSince);
    default:
      return false;
  }
}

// ── Over limit (By customer) ──

export interface LimitState {
  /** What the customer owes in all its currencies, converted into the limit's currency (only the convertible ones) */
  owed: number;
  limit: number;
  currency: string;
  /** Amounts that have no rate today, left out of `owed` */
  unconverted: { currency: string; amount: number }[];
}

/**
 * Each customer with a credit limit and what it owes against it, converted the way the customer's Finance tab does
 * (@/lib/fx convert, today's ČNB rates, into the customer's currency). Every currency the customer owes in counts: the
 * limit is the customer's, not one currency's. Customers without a limit (0) or without a currency are left out.
 */
export function limitStates(customers: readonly ReceivableCustomer[], rates: Rates): Map<string, LimitState> {
  const out = new Map<string, LimitState>();
  for (const c of customers) {
    if (!(c.creditLimit > 0) || !c.creditCurrency) continue;
    const state = out.get(c.customerId) ?? { owed: 0, limit: c.creditLimit, currency: c.creditCurrency, unconverted: [] };
    // The limit's own currency needs no rate (convert would ask for one).
    const converted = c.currency === c.creditCurrency ? c.unpaid : convert(c.unpaid, c.currency, c.creditCurrency, rates);
    if (converted === null) state.unconverted.push({ currency: c.currency, amount: c.unpaid });
    else state.owed = round2(state.owed + converted);
    out.set(c.customerId, state);
  }
  return out;
}

/**
 * Whether the customer is over its limit: what could be converted is above it already (anything unconverted only adds
 * to it). When it is not, and something could not be converted, nothing can be said: no mark.
 */
export const isOverLimit = (s: LimitState | undefined): boolean => !!s && s.limit > 0 && s.owed > s.limit;

/**
 * How much of its credit limit the customer uses: what it owes in all (converted, as the mark counts it) as a whole
 * per cent of the limit (user council A15: "Over limit" was only a filter, so who is close could not be seen).
 */
export const limitUsedPct = (s: LimitState): number => (s.limit > 0 ? Math.round((s.owed / s.limit) * 100) : 0);

/** The By customer's Credit limit cell as text: "100,000.00 EUR · 87 % used", and what has no rate left out. */
export function limitText(s: LimitState | null | undefined): string {
  if (!s || !(s.limit > 0)) return "";
  const left = s.unconverted.length ? ` (without ${s.unconverted.map((u) => formatAmount(u.amount, u.currency)).join(" + ")})` : "";
  return `${formatAmount(s.limit, s.currency)} · ${limitUsedPct(s)} % used${left}`;
}

/** The mark's tooltip: the figures behind it. */
export function overLimitTip(s: LimitState, fixingLabel: string): string {
  const left = s.unconverted.length ? `, without ${s.unconverted.map((u) => formatAmount(u.amount, u.currency)).join(" + ")} that has no rate today` : "";
  return `Owes ${formatAmount(s.owed, s.currency)} in all (converted at the rates of ${fixingLabel || "today"}${left}), above its credit limit of ${formatAmount(s.limit, s.currency)}`;
}

// ── Amounts as the page writes them ──

/** "48,400.00 CZK", "−476.00 EUR": two decimals always, so a column of them lines up; "—" for none. */
export function amountText(amount: number | null | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const v = round2(amount);
  return `${v < 0 ? "−" : ""}${money(Math.abs(v))} ${currency}`;
}

/**
 * "36,300.00 − 476.00 credited − 20,000.00 paid − 12.00 bank charges − 100.00 written off": how Left to pay comes
 * about (the drawer). Only confirmed write-offs and bank charges count; one waiting for a second manager is not in it.
 */
export function leftToPaySum(r: Pick<ReceivableRow, "status" | "gross" | "credited" | "paid"> & Partial<Pick<ReceivableRow, "writtenOff" | "bankCharges">>): string {
  const owed = r.status === "cancelled" ? 0 : r.gross;
  const parts = [money(owed)];
  if (r.credited) parts.push(`${money(r.credited)} credited`);
  if (r.paid) parts.push(`${money(r.paid)} paid`);
  // A write-off is not paid (mock council R1, as the server's leftToPayOf): it closes the rest down to 0 only, so a
  // credit note after it cancels it up to its amount. Name what of it still counts.
  let covered = "";
  if (r.writtenOff) {
    const before = round2(owed - r.credited - r.paid - (r.bankCharges ?? 0));
    const counts = round2(Math.min(r.writtenOff, Math.max(0, before)));
    if (counts === round2(r.writtenOff)) parts.push(`${money(r.writtenOff)} written off`);
    else if (counts > 0) parts.push(`${money(counts)} written off (of ${money(r.writtenOff)}; the credit covers the rest)`);
    else covered = ` (the ${money(r.writtenOff)} written off is covered by the credit)`;
  }
  if (r.bankCharges) parts.push(`${money(r.bankCharges)} bank charges`);
  return parts.join(" − ") + covered;
}

/** The Paid column: the amount paid so far and its last day; "day not known" for a payment carried over (D15). */
export function paidText(r: Pick<ReceivableRow, "paid" | "lastPaidOn" | "currency">): string {
  if (!(r.paid > 0)) return "";
  return `${amountText(r.paid, r.currency)} · ${r.lastPaidOn ? formatDate(r.lastPaidOn) : "day not known"}`;
}

// ── What the drawer may offer (D11, D12, D16, D17) ──

export const MIN_REASON = 3;
export const reasonOk = (reason: string) => reason.trim().length >= MIN_REASON;
/** The longest text the server takes for a chase note: a note, a promise's words, a dispute and its end, a reminder's note. */
export const MAX_NOTE = 2000;
/** The longest text the server takes for a payment's note and a write-off's or a take-back's reason. */
export const MAX_REASON = 1000;

export interface ActionState {
  /** Offered at all */
  shown: boolean;
  /** Why it can't be done now ("" when it can) */
  blocked: string;
}

const off: ActionState = { shown: false, blocked: "" };
const on = (blocked = ""): ActionState => ({ shown: true, blocked });

export interface ReceivableActions {
  notePayment: ActionState;
  writeOff: ActionState;
  bankCharge: ActionState;
  note: ActionState;
  promise: ActionState;
  dispute: ActionState;
  closeDispute: ActionState;
  reminder: ActionState;
  sendAgain: ActionState;
}

/** What waits already leaves nothing to write off (the server's writeOffProblem). */
export const ALL_WAITS = "What is left to pay already waits to be written off: a second manager confirms it, or it is taken back";

/**
 * What the drawer offers (services/receivable, lib/receivables noteProblem): a payment, a write-off and a bank charge
 * for managers on an invoice still owed (the last two only while something is left once what waits is counted); a
 * note, a promise, a dispute and its end and a reminder for everyone (the final notice is managers' within the
 * reminder form); Send again for managers when a hand-over to the customer's list failed. `waiting`: the write-offs
 * and bank charges on it waiting for a second manager (waitingTotal).
 */
export function actionsFor(r: Pick<ReceivableRow, "status" | "leftToPay" | "disputed">, canAct: boolean, sendAgain: boolean, waiting = 0): ReceivableActions {
  const owed = isOwed(r);
  const notOwed = "Nothing is left to pay on this invoice";
  const writable = canAct && (r.status === "unpaid" || r.status === "part_paid");
  const closing = writable ? on(!owed ? notOwed : writeOffRoom(r.leftToPay, waiting) <= 0 ? ALL_WAITS : "") : off;
  return {
    notePayment: writable ? on(owed ? "" : notOwed) : off,
    writeOff: closing,
    bankCharge: closing,
    note: on(),
    promise: owed ? on() : off,
    dispute: owed && !r.disputed ? on() : off,
    closeDispute: r.disputed ? on() : off,
    reminder: owed ? on(r.disputed ? "The customer disputes it: close the dispute before sending a reminder" : "") : off,
    sendAgain: canAct && sendAgain ? on() : off,
  };
}

/** The reminder levels the user may record: 1 and 2 for everyone, the final notice for managers (D17). */
export const reminderLevels = (canAct: boolean): (1 | 2 | 3)[] => (canAct ? [1, 2, 3] : [1, 2]);

/** The level a new reminder starts at: the one after the last, at most the highest the user may record. */
export function nextReminderLevel(last: number, canAct: boolean): 1 | 2 | 3 {
  const levels = reminderLevels(canAct);
  const next = Math.min(Math.max(1, last + 1), 3) as 1 | 2 | 3;
  return levels.includes(next) ? next : levels[levels.length - 1]!;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailOk = (v: string): boolean => EMAIL.test(v.trim());

/**
 * The disabled actions' reasons, each said once with the buttons it holds back ("Write off…, Bank charge…"): shown as
 * text beside the buttons, not only in a hover tooltip. In the order the buttons are.
 */
export function blockedReasons(actions: readonly { state: ActionState; label: string }[]): { text: string; labels: string[] }[] {
  const out: { text: string; labels: string[] }[] = [];
  for (const { state, label } of actions) {
    if (!state.shown || !state.blocked) continue;
    const same = out.find((o) => o.text === state.blocked);
    if (same) same.labels.push(label);
    else out.push({ text: state.blocked, labels: [label] });
  }
  return out;
}

/** Whether an invoice is on prepayment: a payment may then come before it is issued (the server's paymentProblem). */
export const onPrepayment = (r: Pick<ReceivableRow, "marks">): boolean => r.marks.includes("prepayment");

/**
 * Why the payment can't be noted as typed, or "" (the server's paymentProblem, for the form's fields). An invoice on
 * prepayment (`prepayment`) may be paid before the day it was issued, never after today.
 */
export function paymentProblem(input: {
  day: string;
  amountText: string;
  today: string;
  issueDate: string;
  leftToPay: number;
  currency: string;
  prepayment?: boolean;
  /** Issued again after a credit note (Y2): the replaced invoice's issue day, a payment may be from then on */
  issuedAgainFrom?: string | null;
}): string {
  if (!input.day) return "Pick the day it was paid";
  if (input.day > input.today) return "The day it was paid cannot be after today";
  const from = earliestPaidOn(input);
  if (from && input.day < from) {
    return from < input.issueDate
      ? `The day it was paid cannot be before the invoice this one replaces was issued (${formatDate(from)})`
      : `The day it was paid cannot be before the invoice was issued (${formatDate(input.issueDate)})`;
  }
  const amount = parseMoney(input.amountText);
  if (!input.amountText.trim()) return "Give the amount paid";
  if (amount === null) return "The amount must be a number with at most 2 decimals";
  if (amount <= 0) return "The amount must be above 0";
  if (round2(amount) > round2(input.leftToPay)) return `More than is left to pay (${round2(input.leftToPay).toFixed(2)} ${input.currency})`;
  return "";
}

/**
 * The first day a payment may be noted on (the server's rule): the issue day; none on prepayment; for an invoice issued
 * again after a credit note, the day the invoice it replaces was issued (mock test council Y2).
 */
export function earliestPaidOn(input: { issueDate: string; prepayment?: boolean; issuedAgainFrom?: string | null }): string | null {
  if (input.prepayment) return null;
  return input.issuedAgainFrom && input.issuedAgainFrom < input.issueDate ? input.issuedAgainFrom : input.issueDate;
}

/** The amount the form starts with: the whole of what is left to pay, so the common case is one click (D12). */
export const fullAmountText = (leftToPay: number): string => (leftToPay > 0 ? round2(leftToPay).toFixed(2) : "");

/** A new key for one payment: the server notes a key once, and a second send with it gets the first answer. */
export function newIdempotencyKey(): string {
  const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (c?.randomUUID) return `ar-payment:${c.randomUUID()}`;
  return `ar-payment:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The key a payment form sends, one per day and amount for as long as the form is open (`keys` lives with the form).
 * A double click, or a retry after a lost answer, sends the same day and amount again with the same key: one payment.
 * Another day or amount is another payment, with a new key, so it is never taken for the first one.
 */
export function paymentIdempotencyKey(keys: Map<string, string>, paidOn: string, amount: number, make: () => string = newIdempotencyKey): string {
  const values = `${paidOn}|${round2(amount).toFixed(2)}`;
  let key = keys.get(values);
  if (!key) {
    key = make();
    keys.set(values, key);
  }
  return key;
}

// ── Write-offs and bank charges (step 7, D13) ──

export type LineKind = interfaces.ReceivableLineKind;
export type WriteOffKind = "write_off" | "bank_charge";
export type ReceivableLine = interfaces.ReceivablePaymentItem;

export const LINE_KIND_LABEL: Record<LineKind, string> = {
  payment: "Payment",
  carried_over: "Carried over",
  write_off: "Write-off",
  bank_charge: "Bank charge",
};

/** How a line is named in a sentence: "payment", "write-off", "bank charge". */
export const lineWord = (kind: LineKind): string => (kind === "write_off" ? "write-off" : kind === "bank_charge" ? "bank charge" : "payment");

export const isWriteOffKind = (kind: LineKind): kind is WriteOffKind => kind === "write_off" || kind === "bank_charge";

/** The write-offs and bank charges on the invoice still waiting for a second manager: they count for nothing yet. */
export const waitingTotal = (lines: readonly Pick<ReceivableLine, "amount" | "waiting">[]): number => round2(lines.reduce((sum, l) => (l.waiting ? sum + l.amount : sum), 0));

/** What a new write-off or bank charge may close: what is left to pay less what already waits (never below 0). */
export const writeOffRoom = (leftToPay: number, waiting: number): number => Math.max(0, round2(leftToPay - waiting));

/** The amount the form starts with: all that may still be closed. */
export const writeOffPrefill = (leftToPay: number, waiting: number): string => {
  const room = writeOffRoom(leftToPay, waiting);
  return room > 0 ? room.toFixed(2) : "";
};

/**
 * The amount a write-off or bank charge form starts with: a write-off all that may still be closed (writeOffPrefill);
 * a bank charge nothing - it is the few euros the bank kept, not the rest of the invoice (user council A14).
 */
export const writeOffStart = (kind: WriteOffKind, leftToPay: number, waiting: number): string =>
  kind === "bank_charge" ? "" : writeOffPrefill(leftToPay, waiting);

/** Why the write-off or bank charge can't be written as typed, or "" (the server's writeOffProblem, for the form). */
export function writeOffProblem(input: { kind: WriteOffKind; amountText: string; reason: string; leftToPay: number; waiting: number; currency: string }): string {
  const word = lineWord(input.kind);
  if (!input.amountText.trim()) return `Give the amount of the ${word}`;
  const amount = parseMoney(input.amountText);
  if (amount === null) return "The amount must be a number with at most 2 decimals";
  if (amount <= 0) return "The amount must be above 0";
  if (!(input.leftToPay > 0)) return "Nothing is left to pay on this invoice";
  const room = writeOffRoom(input.leftToPay, input.waiting);
  if (room <= 0) return ALL_WAITS;
  if (round2(amount) > room) {
    return input.waiting > 0
      ? `More than is left to pay once what waits for a second manager is counted (${room.toFixed(2)} ${input.currency})`
      : `More than is left to pay (${room.toFixed(2)} ${input.currency})`;
  }
  if (!reasonOk(input.reason)) return `Say why the ${word} closes what is left (at least ${MIN_REASON} characters)`;
  return "";
}

/** Where a line stands, in a few words: "Waiting for a second manager", "Confirmed by …", "self-confirmed". */
export function lineState(l: Pick<ReceivableLine, "kind" | "waiting" | "confirmed" | "takenBack">): string {
  if (!isWriteOffKind(l.kind)) return "";
  if (l.takenBack) return "";
  if (l.waiting) return "Waiting for a second manager";
  if (l.confirmed) return `Confirmed by ${l.confirmed.by || "a manager"}${l.confirmed.self ? " (self-confirmed: no other manager)" : ""}`;
  return "";
}

// ── One payment over several invoices (step 7) ──

export const BATCH_MAX = 100;

/** The tabs where a manager ticks invoices for one payment: the ones that list what is owed. */
export const BATCH_TABS: readonly ReceivableTab[] = ["unpaid", "overdue"];

/** An invoice one payment can pay: still owed (the server refuses the others). */
export const batchSelectable = (r: Pick<ReceivableRow, "status" | "leftToPay">): boolean => isOwed(r);

/** One bank payment is in one currency (the server's batchCurrencyProblem); "" when they agree. */
export function batchCurrencyProblem(currencies: readonly string[]): string {
  const distinct = [...new Set(currencies)].sort();
  return distinct.length > 1 ? `One payment is in one currency: these invoices are in ${distinct.join(" and ")}. Tick invoices of one currency.` : "";
}

export interface BatchLineInput {
  row: Pick<ReceivableRow, "id" | "number" | "status" | "leftToPay" | "currency" | "issueDate" | "marks" | "issuedAgainFrom">;
  amountText: string;
}

export interface BatchCheck {
  /** Why it can't be sent, the first reason; "" when it can */
  problem: string;
  /** Each invoice's own problem, by its id ("" when its amount is fine) */
  lines: Record<string, string>;
  /** What the payment adds up to, in its one currency (the amounts that are numbers) */
  sum: number;
  currency: string;
}

/**
 * The batch dialog's check, as the server checks it (lib/receivables batchProblem, paymentProblem): 1 to 100 invoices,
 * all in one currency, a day not after today and not before an invoice was issued (unless it is on prepayment; for an
 * invoice issued again, not before the invoice it replaces was issued - earliestPaidOn, Y2), and on each invoice an
 * amount above 0 and at most what is left to pay on it.
 */
export function batchCheck(input: { day: string; today: string; lines: readonly BatchLineInput[] }): BatchCheck {
  const lines: Record<string, string> = {};
  let sum = 0;
  for (const { row, amountText: typed } of input.lines) {
    const amount = parseMoney(typed);
    let problem = "";
    if (!typed.trim()) problem = "Give the amount";
    else if (amount === null) problem = "A number with at most 2 decimals";
    else if (amount <= 0) problem = "Above 0";
    else if (!isOwed(row)) problem = "Nothing is left to pay on it";
    else if (round2(amount) > round2(row.leftToPay)) problem = `More than is left to pay (${round2(row.leftToPay).toFixed(2)} ${row.currency})`;
    if (amount !== null && amount > 0) sum = round2(sum + amount);
    lines[row.id] = problem;
  }
  const currencies = input.lines.map((l) => l.row.currency);
  // Never one sum across currencies: none is named when they differ.
  const distinct = [...new Set(currencies)];
  const currency = distinct.length === 1 ? distinct[0]! : "";
  const first = (): string => {
    if (!input.lines.length) return "Tick at least one invoice the payment pays";
    if (input.lines.length > BATCH_MAX) return `One payment covers at most ${BATCH_MAX} invoices`;
    const cur = batchCurrencyProblem(currencies);
    if (cur) return cur;
    if (!input.day) return "Pick the day it was paid";
    if (input.day > input.today) return "The day it was paid cannot be after today";
    for (const { row } of input.lines) {
      const from = earliestPaidOn({ issueDate: row.issueDate, prepayment: onPrepayment(row), issuedAgainFrom: row.issuedAgainFrom });
      if (!from || input.day >= from) continue;
      return from < row.issueDate
        ? `The day it was paid cannot be before the invoice ${row.number} replaces was issued (${formatDate(from)})`
        : `The day it was paid cannot be before invoice ${row.number} was issued (${formatDate(row.issueDate)})`;
    }
    const bad = input.lines.find((l) => lines[l.row.id]);
    if (bad) return `Invoice ${bad.row.number}: ${lines[bad.row.id]}`;
    return "";
  };
  return { problem: first(), lines, sum, currency };
}

/** A new key for one payment over several invoices (the server writes it once, a second send answers the first). */
export const newBatchKey = (): string => newIdempotencyKey().replace(/^ar-payment:/, "ar-batch:");

/**
 * The key the batch dialog sends, one per day and set of invoice amounts for one opening of the dialog (`keys` lives
 * with it, and its invoices are frozen when it opens): a double click or a retry after a lost answer sends the same
 * invoices, versions, day and amounts with the same key, so the server replays its first answer; only an edit of the
 * day or an amount makes another payment with a new key (as the single payment form does).
 */
export function batchIdempotencyKey(
  keys: Map<string, string>,
  paidOn: string,
  items: readonly { invoiceId: string; amount: number; version?: number }[],
  make: () => string = newBatchKey,
): string {
  const values = `${paidOn}|${[...items]
    .map((i) => `${i.invoiceId}@${i.version ?? ""}:${round2(i.amount).toFixed(2)}`)
    .sort()
    .join(",")}`;
  let key = keys.get(values);
  if (!key) {
    key = make();
    keys.set(values, key);
  }
  return key;
}

/**
 * The invoices of one batch payment, frozen when the dialog opens: what the manager saw (id, version, what was left to
 * pay, currency, number). The list read again meanwhile never changes them, so a retry sends what was seen - never a
 * smaller set, never a version the manager did not see.
 */
export const frozenBatchRows = (rows: readonly ReceivableRow[]): ReceivableRow[] => rows.map((r) => ({ ...r, marks: [...r.marks] }));

/** The items one batch payment sends: each frozen invoice with its version and the amount typed for it. */
export function batchItems(rows: readonly Pick<ReceivableRow, "id" | "version">[], amounts: Readonly<Record<string, string>>): { invoiceId: string; version: number; amount: number }[] {
  return rows.map((r) => ({ invoiceId: r.id, version: r.version, amount: round2(parseMoney(amounts[r.id] ?? "") ?? 0) }));
}

// The server's codes for a refusal it decided (nothing written): any other failure - no answer, a network error, a
// gateway's reply, an internal error - says nothing about whether the write happened.
const REFUSAL_CODES = new Set([
  "invalid_argument",
  "failed_precondition",
  "not_found",
  "already_exists",
  "permission_denied",
  "unauthenticated",
  "aborted",
  "out_of_range",
  "resource_exhausted",
  "unimplemented",
]);

/** Whether the server answered with a refusal (nothing was written), not a lost answer or an error of its own. */
export function isServerRefusal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return typeof code === "string" && REFUSAL_CODES.has(code) && typeof message === "string" && !!message.trim();
}

/** What the batch dialog says when its payment failed: the server's refusal, or that it may have been noted. */
export function batchFailureText(err: unknown): { refused: boolean; text: string } {
  if (isServerRefusal(err)) return { refused: true, text: `Nothing was noted: ${(err as { message: string }).message}` };
  return { refused: false, text: "The payment may have been noted: check the invoices before trying again" };
}

/** The selection kept to what can still be paid: a ticked invoice paid or gone meanwhile drops out. */
export function prunedSelection(selected: readonly string[], rows: readonly Pick<ReceivableRow, "id" | "status" | "leftToPay">[]): string[] {
  const ok = new Set(rows.filter(batchSelectable).map((r) => r.id));
  return selected.filter((id) => ok.has(id));
}

// ── The list's widths (user council A5) ──

/** The most of an invoice number the list shows before it shortens it. */
export const NUMBER_SHOWN = 16;

/**
 * The list's widths of all ten columns it shows at first, in px with each cell's 6 px padding on both sides: at 1440 px
 * the 260 px menu, the page's 32 px sides and the card's border leave the table LIST_ROOM, which these, the tick box and
 * the expand arrow fit (1,104 px) - so the whole list, Issued too, is on screen with no scrolling (mock test S21-079;
 * at first only Currency was aimed for, and Paid and Issued fell off). Each is what its cell holds, measured in the app
 * at 1440 px: the number shortened ("INV2026…0125-003", 142 px), the Status marks wrapping, the customer cut and the job
 * shortened ("CZROAD…0094", 102 px), each whole on hover; a day "28.12.2026" (75 px) with "12 days overdue" under it
 * (86 px, a longer one wraps); the amounts without their currency while the Currency column shows it ("1,234,567.89",
 * 87 px, bold too), and Currency as wide as its title. A header wider than its column is on two lines.
 */
export const LIST_WIDTHS = {
  number: 156,
  status: 100,
  customer: 102,
  job: 116,
  due: 100,
  gross: 100,
  left: 100,
  currency: 80,
  paid: 100,
  issued: 88,
} as const;
/** The table's room at 1440 px: 1440 − 260 (menu) − 2 × 32 (page sides) − 2 (card border). */
export const LIST_ROOM = 1114;
/**
 * The tick box column (one payment over several invoices) and antd's expand arrow column: the box or the arrow and the
 * padding (antd keeps the tick box column at 32 px at least).
 */
export const LIST_TICK_WIDTH = 32;
export const LIST_EXPAND_WIDTH = 30;
/**
 * A cell's padding, left and right: what its content may take is its width less this. The list's cells have 6 px a
 * side, not antd's 8 (LIST_CELL_CLASS): with 8 the ten columns fit only with the customer cut to a few letters (mock test
 * S21-079).
 */
export const LIST_CELL_PADDING = 12;
/** The class that gives the list's cells their LIST_CELL_PADDING. */
export const LIST_CELL_CLASS = "[&_.ant-table-cell]:!px-1.5";

/**
 * An invoice number as the list shows it in a column of its own width: a long one loses its middle, never its end -
 * "INV2026CZFCL00000062-001" is "INV2026…0062-001", so the document, the year and the sequence of the job's series stay
 * (the job is in the column beside it). The whole number is on hover, and the Filter panel matches the whole number.
 */
export function shortInvoiceNumber(number: string, max = NUMBER_SHOWN): string {
  if (number.length <= max) return number;
  const head = 7;
  return `${number.slice(0, head)}…${number.slice(number.length - (max - head - 1))}`;
}

/** The most of a job number the list shows before it shortens it ("CZ00000053" is whole). */
export const JOB_SHOWN = 10;

/**
 * A job number as the list shows it (mock test S21-079): a long one keeps its letters and the last four digits of its
 * number, its leading zeros go - "CZROAD00000094" is "CZROAD…0094", "CZFCL00000062" "CZFCL…0062". At most `max` - 4
 * letters, so it never runs past the column ("CZPROJECT00000023" is "CZPROJ…0023", not cut again at its end - review
 * of the S21-079 fix). The whole number is on hover, and the Filter panel matches the whole number. Another text is
 * cut in its middle, as an invoice number is.
 */
export function shortJobNumber(job: string, max = JOB_SHOWN): string {
  if (job.length <= max) return job;
  const [, letters, digits] = /^(CZ[A-Z]*)(\d+)$/.exec(job) ?? [];
  if (letters && digits && digits.length > 4) return `${letters.slice(0, Math.max(2, max - 4))}…${digits.slice(-4)}`;
  const tail = 4;
  return `${job.slice(0, max - tail - 1)}…${job.slice(-tail)}`;
}

/**
 * An amount as a column of the list shows it: without its currency while the Currency column beside it says it
 * ("1,234,567.89", so the whole list fits a 1440 px screen, mock test S21-079), with it while Currency is hidden.
 */
export function listAmountText(amount: number | null | undefined, currency: string, currencyShown: boolean): string {
  const text = amountText(amount, currency);
  return currencyShown && text.endsWith(` ${currency}`) ? text.slice(0, -(currency.length + 1)) : text;
}

// ── Whom the reminders go to (D17; user council A7) ──

/**
 * The customer has no contact a reminder goes to - Accounts payable, else Finance / Accounting, else the main contact,
 * each only with an e-mail (customers lib/receivable reminderContact) - and where one is added. Not "no contact with an
 * e-mail": a customer whose only contact is, say, its Logistics Manager has one, and still gets no reminder.
 */
export const NO_REMINDER_CONTACT = "No accounts, finance or main contact with an e-mail (Customer Database → Contacts)";

/** Said while the automatic reminders are on: the daily run skips such a customer, and nothing else tells of it. */
export const REMINDERS_CANNOT_GO_OUT = "Reminders can't go out: no accounts, finance or main contact with an e-mail";

/**
 * Whether the drawer warns that the automatic reminders skip this invoice: they are on (the list's autoRemindersSince;
 * null while they are off or e-mail from the app is), the invoice is still owed, and the customer has no reminder
 * contact. While they are off a reminder is sent by hand, where the address can be typed: the plain line says enough.
 */
export function remindersBlocked(
  row: Pick<ReceivableRow, "status" | "leftToPay">,
  reminderTo: interfaces.ReceivableCustomerFacts["reminderTo"] | undefined,
  autoRemindersSince: string | null,
): boolean {
  return !!autoRemindersSince && !reminderTo && isOwed(row);
}

// ── Statements and e-mails (step 7) ──

/** "E-mail from the app is switched off": the words every screen uses while it is (the owner's answer, 18 Nov). */
export const EMAIL_OFF_TEXT = "E-mail from the app is switched off";

/** What the user is told after "Send by e-mail": the server's answer, never "sent" unless it says so. */
export function statementSendAnswer(answer: interfaces.ReceivableStatementSendResponse): { tone: "success" | "error" | "warning"; text: string } {
  if (answer.status === "sent") return { tone: "success", text: answer.message || "The statement was e-mailed" };
  if (answer.status === "off") return { tone: "warning", text: `${EMAIL_OFF_TEXT}: the statement was not sent. Download the PDF and send it from your own mail program.` };
  return { tone: "error", text: `The statement was not sent: ${answer.message || "the e-mail could not be sent"}` };
}

/** A base64 file the server sent, as bytes to save (the app does not save data: URLs). */
export function base64Blob(contentBase64: string, contentType: string): Blob {
  return new Blob([Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0))], { type: contentType || "application/octet-stream" });
}

export type ReceivableMail = interfaces.ReceivableMailItem;

/** One e-mail of the app, in a line: "Reminder 1 · sent to x@y.cz · automatic" (the drawer's history). */
export function mailLine(m: Pick<ReceivableMail, "kind" | "reminderLevel" | "status" | "recipient" | "automatic" | "by" | "currency" | "error">): { title: string; detail: string; failed: boolean } {
  const level = m.reminderLevel === 1 || m.reminderLevel === 2 || m.reminderLevel === 3 ? REMINDER_LEVEL_LABEL[m.reminderLevel] : "Reminder";
  const what = m.kind === "statement" ? `Statement (${m.currency})` : level;
  const failed = m.status === "failed";
  const title = `${what} ${failed ? "not sent" : "e-mailed"}`;
  const who = m.automatic ? "automatic" : m.by ? `by ${m.by}` : "";
  const detail = [m.recipient ? `to ${m.recipient}` : "", who, failed && m.error ? `why: ${m.error}` : ""].filter(Boolean).join(" · ");
  return { title, detail, failed };
}

// ── Billing approvals (Sales → Managers) ──

/** "2 write-offs wait for a second manager", "1 bank charge waits …", "3 write-offs and bank charges wait …". */
export function waitingText(lines: readonly Pick<interfaces.ReceivableWaitingLine, "kind">[]): string {
  const n = lines.length;
  const offs = lines.filter((l) => l.kind === "write_off").length;
  const what = offs === n ? (n === 1 ? "write-off" : "write-offs") : offs === 0 ? (n === 1 ? "bank charge" : "bank charges") : "write-offs and bank charges";
  return `${n} ${what} ${n === 1 ? "waits" : "wait"} for a second manager`;
}

/**
 * The waiting lines a manager can do something about: those the server says they may confirm, and apart from them
 * their own (written by them, so another manager confirms). A line neither theirs nor confirmable is in neither.
 */
export function waitingSplit<L extends Pick<interfaces.ReceivableWaitingLine, "canConfirm" | "by">>(lines: readonly L[], email: string | null | undefined): { confirmable: L[]; mine: L[] } {
  const me = (email ?? "").trim().toLowerCase();
  const confirmable = lines.filter((l) => l.canConfirm);
  // Without the user's e-mail, a line they may not confirm is taken for theirs (the server's rule: not your own).
  const mine = lines.filter((l) => !l.canConfirm && (!me || l.by.trim().toLowerCase() === me));
  return { confirmable, mine };
}

/** "2 of yours wait for another manager": the user's own write-offs and bank charges, which they cannot confirm. */
export const mineWaitingText = (n: number): string => `${n} of yours ${n === 1 ? "waits" : "wait"} for another manager`;

export type ReminderDraft = interfaces.ReceivableReminderDraft;

/**
 * The reminder as the user's mail program opens it: the server's own text of that level (mock test council m3: the
 * customer's language, the bank account and the variable symbol, as the app's e-mail writes it), else - an older
 * answer without it - the plain English one below. The app sends nothing: the user sends it and records it (D17).
 */
export function reminderMailOf(
  drafts: readonly ReminderDraft[] | undefined,
  r: Pick<ReceivableRow, "number" | "jobNumber" | "issueDate" | "dueDate" | "leftToPay" | "currency" | "daysOverdue">,
  level: 1 | 2 | 3,
): { subject: string; message: string } {
  const draft = drafts?.find((d) => d.level === level);
  return draft ? { subject: draft.subject, message: draft.body } : reminderMail(r, level);
}

/** How far ahead a promise to pay may be noted: 60 days for a user, no limit for a manager (K13, the server's rule). */
export const PROMISE_MAX_DAYS = 60;

/** Why the promised day is refused ("" when it is fine): not before today; for a user at most 60 days ahead. */
export function promiseProblem(promisedOn: string, today: string, canAct: boolean): string {
  if (!promisedOn) return "Pick the day the customer promised to pay by";
  if (promisedOn < today) return "The promised day cannot be before today";
  if (!canAct && promisedOn > addDays(today, PROMISE_MAX_DAYS)) return `A promise is at most ${PROMISE_MAX_DAYS} days ahead: a manager notes a later one`;
  return "";
}

/** The server said the user may not do or see this (a role's refusal), as opposed to any other failure. */
export function isForbidden(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === "permission_denied";
}

/**
 * The reminder as the user's mail program opens it: subject and text only, in English (the fallback of
 * reminderMailOf). The app sends nothing: the user sends it and the app records that it was sent (D17).
 */
export function reminderMail(r: Pick<ReceivableRow, "number" | "jobNumber" | "issueDate" | "dueDate" | "leftToPay" | "currency" | "daysOverdue">, level: 1 | 2 | 3): { subject: string; message: string } {
  const what = level === 3 ? "Final notice" : `Payment reminder${level === 2 ? " (second)" : ""}`;
  const subject = `${what}: invoice ${r.number}${r.jobNumber ? ` (${r.jobNumber})` : ""}`;
  const late = r.daysOverdue > 0 ? `, ${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} ago` : "";
  const lines = [
    "Dear Sir or Madam,",
    "",
    `our invoice ${r.number} of ${formatDate(r.issueDate)} was due on ${formatDate(r.dueDate)}${late}. ${amountText(r.leftToPay, r.currency)} is still left to pay.`,
    level === 3
      ? "This is our final notice. Please pay the amount at once, or tell us by return why it is not paid."
      : "Please pay the amount, or let us know if it has been paid already or if something on the invoice is not right.",
    "",
    "Kind regards",
  ];
  return { subject, message: lines.join("\n") };
}

// ── History ──

/** One entry of an invoice's history: the issue, a credit note's issue (on their days) or an event (at its moment). */
export type HistoryEntry =
  | { kind: "issued"; at: string }
  | { kind: "credit_note"; at: string; note: interfaces.ReceivableCreditNoteItem }
  | { kind: "event"; at: string; event: interfaces.ReceivableEventItem };

/**
 * The invoice's history in one time order, the oldest first (user council A13: the issue first, then the events newest
 * first, did not read in order). The issue and a credit note carry only their day, so they come before what happened
 * later that day; entries at the same moment keep the order given. An event is placed by its Prague day (mock council
 * S8-5: compared as a UTC time, a payment noted at 00:30 Prague sorted before that day's "Issued").
 */
export function historyEntries(
  issueDate: string,
  creditNotes: readonly interfaces.ReceivableCreditNoteItem[],
  events: readonly interfaces.ReceivableEventItem[],
): HistoryEntry[] {
  const all: HistoryEntry[] = [
    { kind: "issued", at: issueDate },
    ...creditNotes.map((note): HistoryEntry => ({ kind: "credit_note", at: note.issueDate, note })),
    ...events.map((event): HistoryEntry => ({ kind: "event", at: event.at, event })),
  ];
  // The day it belongs to on the company's calendar; the issue and a credit note (a day only) come first on it.
  const keyed = all.map((e, i) => ({ e, i, day: e.kind === "event" ? businessDayOf(e.at) || e.at.slice(0, 10) : e.at, rank: e.kind === "event" ? 1 : 0 }));
  return keyed.sort((a, b) => a.day.localeCompare(b.day) || a.rank - b.rank || a.e.at.localeCompare(b.e.at) || a.i - b.i).map(({ e }) => e);
}

/** Whether the drawer shows "Promised to pay by": only while something is left to pay (A13: a paid invoice kept it). */
export const showsPromise = (r: Pick<interfaces.ReceivableItem, "promisedOn" | "leftToPay">): boolean => !!r.promisedOn && r.leftToPay > 0;

export const EVENT_LABELS: Record<string, string> = {
  issued: "Issued",
  payment_noted: "Payment noted",
  payment_taken_back: "Payment taken back",
  carried_over: "Paid before Accounts Receivable",
  note_added: "Note",
  promised: "Promise to pay",
  disputed: "Disputed",
  dispute_closed: "Dispute closed",
  reminded: "Reminder recorded",
  sent_again: "Sent again to the customer's list",
  write_off_noted: "Write-off noted",
  write_off_confirmed: "Write-off confirmed",
  write_off_taken_back: "Write-off taken back",
};

/** An event's name; a write-off's events say "Bank charge" when the line is one. */
export function eventLabel(e: Pick<interfaces.ReceivableEventItem, "action" | "payload">): string {
  const bank = e.payload?.kind === "bank_charge";
  switch (e.action) {
    case "write_off_noted":
      return bank ? "Bank charge noted" : EVENT_LABELS.write_off_noted!;
    case "write_off_confirmed":
      return bank ? "Bank charge confirmed" : EVENT_LABELS.write_off_confirmed!;
    case "write_off_taken_back":
      return bank ? "Bank charge taken back" : EVENT_LABELS.write_off_taken_back!;
    case "reminded":
      return e.payload?.automatic ? "Reminder e-mailed by the app" : EVENT_LABELS.reminded!;
    default:
      return EVENT_LABELS[e.action] ?? e.action;
  }
}

/** What an event changed, in a few words. */
export function eventDetail(e: Pick<interfaces.ReceivableEventItem, "action" | "payload">, currency: string): string {
  const p = e.payload ?? {};
  const amount = typeof p.amount === "number" ? amountText(p.amount, currency) : "";
  const day = typeof p.paidOn === "string" ? formatDate(p.paidOn) : "";
  switch (e.action) {
    case "payment_noted":
      return [
        amount,
        day && `paid on ${day}`,
        typeof p.bankRef === "string" && p.bankRef ? `bank reference ${p.bankRef}` : "",
        typeof p.invoices === "number" && p.invoices > 1 ? `one payment over ${p.invoices} invoices` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "write_off_noted":
      return [amount, "waits for a second manager"].filter(Boolean).join(" · ");
    case "write_off_confirmed":
      return [amount, p.selfConfirmed === true ? "self-confirmed: no other manager" : ""].filter(Boolean).join(" · ");
    case "write_off_taken_back":
      return amount;
    case "payment_taken_back":
      return [amount, day ? `paid on ${day}` : p.kind === "carried_over" ? "carried over, day not known" : ""].filter(Boolean).join(" · ");
    case "carried_over":
      return [amount, "day not known"].filter(Boolean).join(" · ");
    case "promised":
      return typeof p.promisedOn === "string" ? `to pay by ${formatDate(p.promisedOn)}` : "";
    case "reminded": {
      const level = p.level === 1 || p.level === 2 || p.level === 3 ? REMINDER_LEVEL_LABEL[p.level as 1 | 2 | 3] : "";
      return [level, typeof p.recipient === "string" && p.recipient ? `to ${p.recipient}` : ""].filter(Boolean).join(" ");
    }
    default:
      return "";
  }
}

export const NOTE_LABELS: Record<interfaces.ReceivableNoteItem["kind"], string> = {
  note: "Note",
  promise: "Promise",
  dispute: "Dispute",
  dispute_closed: "Dispute closed",
  reminder: "Reminder",
};

// ── CSV (D1, D26) ──

const plain = (n: number) => round2(n).toFixed(2);

/** The marks as words, for the CSV and the Filter panel. */
export const marksText = (r: ReceivableRow): string =>
  markChips(r)
    .map((c) => c.label)
    .join("; ");

/** Who issued a credit note, as the drawer names them: the person's name, else the e-mail; "" when not known (D25). */
export function issuerName(note: { issuedBy: string; issuedByName: string }): string {
  return note.issuedByName || note.issuedBy;
}

/**
 * The invoices shown as a CSV, one line per document, because accounting books an invoice and its credit note apart
 * (the page): each credit note gets a line of its own with its number, day and amount (negative, with VAT) and the
 * invoice it corrects, and what all of an invoice's credit notes took off is also in the invoice's line, in Credited.
 * Amounts with VAT, in the invoice's currency, never converted (CZK as the invoice states it).
 */
export function receivablesCsv(rows: readonly ReceivableRow[]): string[][] {
  const head = [
    "Document",
    "Number",
    "Corrects invoice",
    "Customer",
    "Job",
    "Issued",
    "DUZP",
    "Due",
    "Days overdue",
    "Currency",
    "Net",
    "VAT",
    "Amount with VAT",
    "Credited",
    "Paid",
    "Written off",
    "Bank charges",
    "Left to pay",
    "Amount in CZK",
    "Status",
    "Marks",
    "Last paid on",
    "Promised till",
    "Last reminder",
    "Payment terms",
    "Sales Owner",
    "Person in Charge",
    "Issued by",
  ];
  const out: string[][] = [head];
  for (const r of rows) {
    const paidOn = r.lastPaidOn ?? (r.paid > 0 ? "day not known" : "");
    const reminder = r.reminderLevel > 0 ? `${REMINDER_LEVEL_LABEL[Math.min(r.reminderLevel, 3) as 1 | 2 | 3]} ${r.lastRemindedOn ?? ""}`.trim() : "";
    out.push([
      "Invoice",
      r.number,
      "",
      r.customer,
      r.jobNumber,
      r.issueDate,
      r.duzp,
      r.dueDate,
      r.daysOverdue > 0 ? String(r.daysOverdue) : "",
      r.currency,
      plain(r.net),
      plain(r.vat),
      plain(r.gross),
      plain(r.credited),
      plain(r.paid),
      plain(r.writtenOff ?? 0),
      plain(r.bankCharges ?? 0),
      plain(r.leftToPay),
      plain(r.grossCzk),
      statusLabel(r.status),
      marksText(r),
      paidOn,
      r.promisedOn ?? "",
      reminder,
      r.paymentTerms,
      r.salesOwner,
      r.personInCharge,
      r.issuedBy,
    ]);
    for (const cn of r.creditNotes) {
      out.push(["Credit note", cn.number, r.number, r.customer, r.jobNumber, cn.issueDate, cn.issueDate, "", "", r.currency, "", "", plain(cn.gross), "", "", "", "", "", "", "", "", "", "", "", "", r.salesOwner, r.personInCharge, cn.issuedBy]);
    }
  }
  return out;
}

/** By customer as a CSV: one line per customer and currency, the aging columns as the tab shows them. */
export function customersCsv(rows: readonly ReceivableCustomer[], limits: ReadonlyMap<string, LimitState>): string[][] {
  return [
    ["Customer", "Sales Owner", "Currency", "Unpaid", AGING_LABEL.current, AGING_LABEL["1-30"], AGING_LABEL["31-60"], AGING_LABEL["61-90"], AGING_LABEL["90+"], "Oldest due", "Invoices", "Credit limit", "Over limit"],
    ...rows.map((c) => [
      c.customer,
      c.salesOwner,
      c.currency,
      plain(c.unpaid),
      plain(c.current),
      plain(c.d1to30),
      plain(c.d31to60),
      plain(c.d61to90),
      plain(c.d90plus),
      c.oldestDue ?? "",
      String(c.invoices),
      c.creditLimit > 0 ? `${plain(c.creditLimit)} ${c.creditCurrency}`.trim() : "",
      isOverLimit(limits.get(c.customerId)) ? "Over limit" : "",
    ]),
  ];
}

// ── Links ──

export const shipmentHref = (shipmentId: string): string => `/shipments/${encodeURIComponent(shipmentId)}`;
export const customerHref = (customerId: string): string => `/customers/${encodeURIComponent(customerId)}`;
/** The job's invoices in Invoicing, where a credit note is issued: never here (the page). */
export const invoicingHref = (shipmentId: string): string => `/invoicing?shipment=${encodeURIComponent(shipmentId)}&tab=documents`;
/**
 * The Tools menu's pages (step 7): Bank statements and the export to Pohoda only for a manager (mock test council X6:
 * the server refuses anyone else), month-end and the reminder settings for everyone.
 */
export function receivableTools(canAct: boolean): { key: string; label: string }[] {
  return [
    ...(canAct ? [{ key: "/accounts-receivable/bank", label: "Bank statements" }] : []),
    { key: "/accounts-receivable/month-end", label: "Month-end" },
    ...(canAct ? [{ key: "/accounts-receivable/export", label: "Export to Pohoda" }] : []),
    { key: "/accounts-receivable/settings", label: "Reminder settings" },
  ];
}

/** The pages that are buttons of their own on the bar, not only in Tools (user council A16: month-end was hunted for). */
const BAR_PAGES = new Set(["/accounts-receivable/bank", "/accounts-receivable/month-end"]);

/** The bar's split of the pages: Bank statements and Month-end as buttons, the rest in the Tools menu. */
export function receivableBarTools(canAct: boolean): { buttons: { key: string; label: string }[]; menu: { key: string; label: string }[] } {
  const all = receivableTools(canAct);
  return { buttons: all.filter((t) => BAR_PAGES.has(t.key)), menu: all.filter((t) => !BAR_PAGES.has(t.key)) };
}

/** A bank statement opened on the Bank statements page (managers only). */
export const bankStatementHref = (statementId: string): string => `/accounts-receivable/bank?statement=${encodeURIComponent(statementId)}`;

// ── The bell (D18) ──

/**
 * The bell's line under an Accounts Receivable notice: the job, what is left to pay, and - an overdue one a payment on a
 * bank statement may be for (mock test council X5, n1) - that it may be waiting, so nobody chases a customer who paid.
 */
export function receivableNoticeText(n: { jobNumber: string; milestone: string; leftToPay: number; currency: string; paymentWaiting?: boolean }): string {
  const overdue = n.milestone !== "paid";
  return [n.jobNumber, overdue ? `${formatAmount(n.leftToPay, n.currency)} left to pay` : "", overdue && n.paymentWaiting ? "a payment may be waiting on a bank statement" : ""]
    .filter(Boolean)
    .join(" · ");
}

// ── Taking a payment back (mock test council P8) ──

export type TakeBackKind = "mistake" | "reversed";

/**
 * Why a take-back can't be sent yet, or "" (the server checks it again): a reason; a reversal (a bank return or a
 * refund) needs the day the money went back - not before it was paid, not after today.
 */
export function takeBackFormProblem(f: { reason: string; kind: TakeBackKind; reversedOn: string; paidOn: string | null; today: string }): string {
  if (!reasonOk(f.reason)) return "Say why it is taken back";
  if (f.kind === "mistake") return "";
  if (!f.reversedOn) return "Give the day the payment went back";
  if (f.reversedOn > f.today) return "The day it went back cannot be after today";
  if (f.paidOn && f.reversedOn < f.paidOn) return `The day it went back cannot be before it was paid (${formatDate(f.paidOn)})`;
  return "";
}

/**
 * How a line taken back reads in the drawer, after "Taken back <when> · <who> · ": "Noted by mistake" or "Reversed on
 * 12.11.2026".
 */
export function takenBackText(t: { kind?: string | null; reversedOn?: string | null }): string {
  return t.kind === "reversed" && t.reversedOn ? `Reversed on ${formatDate(t.reversedOn)}` : "Noted by mistake";
}
