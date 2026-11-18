import { convert, type Rates } from "@/lib/fx";
import { formatDate } from "@/lib/date";
import { fmtMoney, roundCents } from "@/lib/money";

// Finance → Accounts Receivable in operations (Council Outlay 10, D20–D22): the payment and credit warnings at a
// release, beside Credit Check and on a new quote or shipment. Warnings only, never a stop: a person reads them and
// can go past. The words are decided here, once; the screens only show them.

/** What the release check says about the job (D20), as the server answers it. */
export interface ReleaseCheckFacts {
  warn: boolean;
  customer: string;
  prepayment: boolean;
  customerOverdueCount: number;
  unpaid: { invoiceId: string; number: string; leftToPay: number; currency: string; daysOverdue: number }[];
}

/** A customer's limit and what it owes (D21), as the server answers it. */
export interface CreditFacts {
  companyName: string;
  creditLimit: number;
  currency: string;
  prepayment: boolean;
  unpaid: { currency: string; amount: number }[];
  overdueCount: number;
  oldestOverdueDue: string | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const nameOf = (name: string | null | undefined) => (name ?? "").trim() || "The customer";

/** "1,450.00 EUR left to pay, 12 days overdue" - what one unpaid invoice of the job still needs. */
export function unpaidInvoiceDetail(i: { leftToPay: number; currency: string; daysOverdue: number }): string {
  const amount = `${fmtMoney(i.leftToPay, i.currency, true)} left to pay`;
  return i.daysOverdue > 0 ? `${amount}, ${plural(i.daysOverdue, "day")} overdue` : amount;
}

/** Why the release warns, in one sentence: "Alfa Trading is on prepayment and has 2 overdue invoices." */
export function releaseReason(check: ReleaseCheckFacts): string {
  const parts: string[] = [];
  if (check.prepayment) parts.push("is on prepayment");
  if (check.customerOverdueCount > 0) parts.push(`has ${plural(check.customerOverdueCount, "overdue invoice")}`);
  if (parts.length === 0) return "The job has an unpaid invoice.";
  return `${nameOf(check.customer)} ${parts.join(" and ")}.`;
}

/**
 * Where a release check stands while a person is about to release. "checking" only during the first try and for a
 * short while: a check that fails or is slow must never hold the release up, it is then "unknown" (released without
 * the warning, with a small note).
 */
export type ReleaseCheckState = "checking" | "warn" | "clear" | "unknown";

/**
 * `fresh`: the answer was read since the dialog opened (answeredSince). An answer kept from an earlier opening says
 * nothing about now - the job may have a new unpaid invoice - so it counts as no answer: still checking, then
 * "unknown" once the time allowed is over or the read fails.
 */
export function releaseCheckState(q: { data: ReleaseCheckFacts | undefined; fresh: boolean; isError: boolean; failureCount: number; timedOut: boolean }): ReleaseCheckState {
  if (q.data && q.fresh) return q.data.warn ? "warn" : "clear";
  if (q.isError || q.failureCount > 0 || q.timedOut) return "unknown";
  return "checking";
}

/** Whether an answer (its time, `dataUpdatedAt`; 0 for none) was read since the check became active at `since`. */
export const answeredSince = (dataUpdatedAt: number, since: number | null): boolean => since !== null && dataUpdatedAt > 0 && dataUpdatedAt >= since;

/** Several jobs released at once: the worst first - one still checking holds the button, one warning shows it. */
export function combinedReleaseState(states: readonly ReleaseCheckState[]): ReleaseCheckState {
  if (states.includes("checking")) return "checking";
  if (states.includes("warn")) return "warn";
  if (states.includes("unknown")) return "unknown";
  return "clear";
}

export const PAYMENT_NOT_CHECKED = "Payment could not be checked.";

/** The customer's unpaid invoices against its credit limit. "pending": today's rates are not in yet. */
export type LimitVerdict =
  | { kind: "none" }
  | { kind: "within" }
  | { kind: "over"; owed: number; converted: boolean }
  | { kind: "unknown"; currencies: string[] }
  | { kind: "pending" };

/**
 * Converts what is owed into the limit's currency the way the customer's Finance tab does (today's ČNB rates,
 * through CZK). A currency without a rate is never guessed: the answer is then "unknown". `rates` null = not in yet.
 */
export function limitVerdict(c: Pick<CreditFacts, "creditLimit" | "currency" | "unpaid">, rates: Rates | null): LimitVerdict {
  if (!(c.creditLimit > 0)) return { kind: "none" };
  let owed = 0;
  let converted = false;
  const missing: string[] = [];
  for (const u of c.unpaid) {
    if (roundCents(u.amount) === 0) continue;
    if (u.currency === c.currency) {
      owed += u.amount;
      continue;
    }
    if (!rates) return { kind: "pending" };
    const v = convert(u.amount, u.currency, c.currency, rates);
    if (v === null) missing.push(u.currency);
    else {
      owed += v;
      converted = true;
    }
  }
  if (missing.length) return { kind: "unknown", currencies: missing };
  owed = roundCents(owed);
  return owed > roundCents(c.creditLimit) ? { kind: "over", owed, converted } : { kind: "within" };
}

/**
 * The credit warning's lines (D21): over the limit, could not compare with the limit, overdue invoices. Empty when
 * there is nothing to warn about (or the rates are still on their way).
 */
export function creditWarningLines(c: CreditFacts, rates: Rates | null): string[] {
  const name = nameOf(c.companyName);
  const lines: string[] = [];
  const v = limitVerdict(c, rates);
  if (v.kind === "over") {
    lines.push(
      `${name} is over its credit limit (owes ${fmtMoney(v.owed, c.currency, true)}${v.converted ? " at today's rates" : ""}, limit ${fmtMoney(c.creditLimit, c.currency, true)}).`,
    );
  } else if (v.kind === "unknown") {
    const which = v.currencies.length === 1 ? "which has" : "which have";
    lines.push(`${name} owes in ${v.currencies.join(", ")}, ${which} no exchange rate today: could not compare with the limit.`);
  }
  if (c.overdueCount > 0) {
    const due = c.oldestOverdueDue ? formatDate(c.oldestOverdueDue) : "";
    const when = due ? (c.overdueCount === 1 ? `, due ${due}` : `, the oldest due ${due}`) : "";
    lines.push(`${name} has ${plural(c.overdueCount, "overdue invoice")}${when}.`);
  }
  return lines;
}

/** The prepayment fact (D22), one short line. */
export function prepaymentLine(c: Pick<CreditFacts, "companyName" | "prepayment">): string | null {
  return c.prepayment ? `${nameOf(c.companyName)} is on prepayment: its invoices are due the day they are issued.` : null;
}

/** Credit Check set to Green while the customer has a credit warning: the warning is shown in that edit. */
export const warnsOnGreen = (value: string, lines: readonly string[]): boolean => value.trim().toLowerCase() === "green" && lines.length > 0;

// ── Work not yet invoiced (step 7): beside the credit limit, never added to what is owed ──

/** What the customer's open jobs carry that is not yet invoiced, per currency, as the server answers it. */
export interface UnbilledFacts {
  amounts: readonly { currency: string; amount: number }[];
  jobs: number;
  /** The server stopped counting at its limit of jobs: the amounts are at least these. */
  capped?: boolean;
}

/**
 * "Not yet invoiced: 1,200.00 EUR, 300.00 CZK (3 jobs)" - each currency on its own, never converted or summed. Null
 * when nothing above 0 is waiting to be invoiced.
 */
export function unbilledLine(u: UnbilledFacts): string | null {
  const amounts = u.amounts.filter((a) => roundCents(a.amount) !== 0);
  if (!amounts.some((a) => roundCents(a.amount) > 0)) return null;
  const money = amounts.map((a) => fmtMoney(a.amount, a.currency, true)).join(", ");
  const jobs = u.jobs > 0 ? ` (${plural(u.jobs, "job")})` : "";
  return `Not yet invoiced: ${u.capped ? "at least " : ""}${money}${jobs}`;
}

export const UNBILLED_NOT_READ = "Work not yet invoiced could not be read";

/** The credit warning's not-yet-invoiced line: information only, shown when it was read and is above 0. */
export function creditUnbilledLine(c: { unbilled?: UnbilledFacts["amounts"]; unbilledJobs?: number; unbilledKnown?: boolean }): string | null {
  if (!c.unbilledKnown || !c.unbilled) return null;
  return unbilledLine({ amounts: c.unbilled, jobs: c.unbilledJobs ?? 0 });
}

// ── The prepayment stop (step 7, D20's later yes): the server refuses, a manager may release with a reason ──

/** A manager's reason to release a stopped job: at least this many characters (the server's rule). */
export const MIN_OVERRIDE_REASON = 3;

/** Whether a manager's reason is long enough to send. */
export const overrideReasonOk = (reason: string): boolean => reason.trim().length >= MIN_OVERRIDE_REASON;

/** Why the server stopped a release: the job is on prepayment and not paid, or its payment could not be checked. */
export type ReleaseStopKind = "unpaid" | "unchecked";

/** The server's refusal of a stopped release: its kind and the server's own sentence, shown as it is. */
export interface ReleaseStop {
  kind: ReleaseStopKind;
  message: string;
}

// The server's sentences (api shipments/lib/prepaymentStop.ts), told apart by these parts of them.
const STOP_UNPAID = "the job is on prepayment and not paid";
const STOP_UNCHECKED = "Whether the job is paid could not be checked";

/**
 * The prepayment stop, from a refused release: a failed precondition whose message is the stop's. Any other refusal
 * (another rule, a server that could not be reached) is null - it is shown as any other error.
 */
export function releaseStopOf(err: unknown): ReleaseStop | null {
  if (!err || typeof err !== "object") return null;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code !== "failed_precondition" || typeof message !== "string") return null;
  if (message.includes(STOP_UNPAID)) return { kind: "unpaid", message };
  if (message.includes(STOP_UNCHECKED)) return { kind: "unchecked", message };
  return null;
}

/**
 * Whether the release check already says the server will stop the release: the job has an invoice on prepayment
 * that is not paid. Only to word the dialog - the server decides, and nothing is stopped here.
 */
export const releaseStopLikely = (check: Pick<ReleaseCheckFacts, "prepayment" | "unpaid"> | null | undefined): boolean =>
  !!check && check.prepayment && check.unpaid.some((u) => roundCents(u.leftToPay) > 0);

/** The dialog's line when the check says the release will be stopped. */
export function releaseStopNote(manager: boolean): string {
  return manager
    ? "This release is stopped for prepayment customers: as a manager you can release with a reason."
    : "This release is stopped for prepayment customers: a manager can release with a reason.";
}

// ── Warehouse Released set by hand (step 7): the same stop, on the field's own edit ──

/** The field the prepayment stop guards when it is set by hand, in the grid or on the shipment's detail. */
export const RELEASED_FIELD = "warehouseReleasedDate";

/** The prepayment stop of an edit of Warehouse Released; null for any other field or any other refusal. */
export const releasedEditStop = (fieldKey: string, err: unknown): ReleaseStop | null => (fieldKey === RELEASED_FIELD ? releaseStopOf(err) : null);

/** Where a stopped release goes when the edit cannot ask for a reason (the grid's inline cell). */
export const RELEASE_ELSEWHERE = "Release it from Stock → release to truck or the shipment's detail, where a manager can give a reason.";

/** The grid's error for a stopped Warehouse Released: the server's sentence, then where to release it. */
export const releaseElsewhereText = (stop: ReleaseStop): string => `${stop.message.trim()} ${RELEASE_ELSEWHERE}`;
