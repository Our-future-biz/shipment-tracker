import { convert, type Rates } from "@/lib/fx";
import { businessDateTime, formatDate } from "@/lib/date";
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
// "…and not paid", and since L3 "…and not invoiced and paid yet" for a job with nothing invoiced: both are this stop.
const STOP_UNPAID = "the job is on prepayment and not ";
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

/** Where a stopped release goes when the edit cannot ask for a reason (the grid's inline cell): a user asks a manager there (D16). */
export const RELEASE_ELSEWHERE = "Release it from Stock → release to truck or the shipment's detail: there a manager gives a reason, and anyone else asks a manager to release it.";

/** The grid's error for a stopped Warehouse Released: the server's sentence, then where to release it. */
export const releaseElsewhereText = (stop: ReleaseStop): string => `${stop.message.trim()} ${RELEASE_ELSEWHERE}`;

// ── "Ask a manager to release" (Council Outlay 11, D16): a user the stop refused asks, a manager decides ──
//
// Approving releases nothing: the approved request is a pass for that job and that release, good for 7 days and
// for one release. Whoever makes the release then makes it the usual way, and it goes through on the approval -
// Warehouse Released at the Warehouse Concept gate's WH release too (api warehouseConcept services/releasePayment).
// The server works out whether a pass can still be used (`usable`); the screens only word what it says.

/** What a release request asks to be released. */
export type ReleaseWhat = "house_bol" | "warehouse";

/** What is asked for, in the app's words (the server's own, api shipments/lib/releaseRequest.ts). */
export const RELEASE_WHAT_LABEL: Record<ReleaseWhat, string> = { house_bol: "House BoL release", warehouse: "Warehouse Released" };

/** A release request as the screens read it (the server's ReleaseRequestItem). */
export interface ReleaseRequestFacts {
  what: ReleaseWhat;
  /** closed: the job was released another way before the request was answered, or before its approval was used. */
  status: "pending" | "approved" | "rejected" | "closed";
  requestedById: string;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string;
  decidedAt: string | null;
  comment: string;
  /** When the approval was used for the release; null while it was not. */
  usedAt: string | null;
  usedByName: string;
  /** Approved: until when it can be used. */
  validUntil: string | null;
  /** Approved, not used and not run out, as the server saw it when it answered. */
  usable: boolean;
  /** Closed: "released" (released another way) or "withdrawn" (K20); null otherwise. Optional for the screens that never read it. */
  closedWhy?: string | null;
  /** Closed: when. */
  closedAt?: string | null;
  /** Withdrawn: by whom, as named then. */
  closedByName?: string;
  /** Withdrawn: why. */
  closeReason?: string;
}

/** "18.11. 14:02" - a moment on the company's calendar and clock, the year left out; "" for none. */
export function shortDateTime(at: string | null | undefined): string {
  return businessDateTime(at).replace(/^(\d{2}\.\d{2}\.)\d{4} /, "$1 ");
}

/** "18.11." - the day of a moment on the company's calendar, the year left out; "" for none. */
export function shortDate(at: string | null | undefined): string {
  return businessDateTime(at).slice(0, 6);
}

type PassFacts = Pick<ReleaseRequestFacts, "status" | "usable" | "usedAt" | "validUntil">;

/**
 * Whether the request lets its release through: approved, not used, and not run out - by the server's word
 * (`usable`), never by this browser's clock, which may be minutes off the server's. When the clock here says its
 * time is over, the request is read again (passRereadAt) and what the server then says is shown.
 */
export function releasePassUsable(request: PassFacts | null | undefined): boolean {
  return !!request && request.status === "approved" && request.usable && !request.usedAt;
}

/** How long past an approval's last moment, on this clock, before the server is asked again. */
export const PASS_REREAD_GRACE_MS = 60_000;

/**
 * When (ms) to read a job's requests again because an approval the server called usable is over on this clock by
 * more than a minute; null when there is nothing to wait for. `readAt` is when the answer in hand was read: one
 * read after that moment is the server's word on it - still usable there, it is not asked a second time.
 */
export function passRereadAt(requests: readonly PassFacts[], readAt: number): number | null {
  let at: number | null = null;
  for (const r of requests) {
    if (!releasePassUsable(r) || !r.validUntil) continue;
    const due = Date.parse(r.validUntil) + PASS_REREAD_GRACE_MS;
    if (Number.isNaN(due) || readAt > due) continue;
    at = at === null ? due : Math.min(at, due);
  }
  return at;
}

/**
 * Where the read of a job's requests stands while a release is being made: "checking" until an answer read since
 * the dialog opened (`since`) is in - an answer kept from earlier says nothing about now, a manager may have
 * approved meanwhile - "failed" when that read failed or took too long, else "read". Not asked at all: "read".
 */
export type ReleasePassRead = "checking" | "read" | "failed";

export function releasePassRead(q: {
  asked: boolean;
  since: number | null;
  hasData: boolean;
  dataUpdatedAt: number;
  isError: boolean;
  errorUpdatedAt: number;
  timedOut: boolean;
}): ReleasePassRead {
  if (!q.asked) return "read";
  if (q.hasData && answeredSince(q.dataUpdatedAt, q.since)) return "read";
  if ((q.isError && answeredSince(q.errorUpdatedAt, q.since)) || q.timedOut) return "failed";
  return "checking";
}

/** Said while the job's requests are read, where "stopped" would otherwise be said too early. */
export const PASS_CHECKING = "Checking for an approval…";
/** Said when they could not be read: the stop is then shown as it is, and a manager keeps their own reason. */
export const PASS_NOT_READ = "Whether a manager approved this release could not be read";

const approver = (r: Pick<ReleaseRequestFacts, "decidedByName">) => r.decidedByName.trim() || "a manager";
// Day and time: an approval ends at its decision's time of day, seven days on.
const validUntilText = (r: Pick<ReleaseRequestFacts, "validUntil">) => (r.validUntil ? ` (valid until ${shortDateTime(r.validUntil)})` : "");

/** Where a job's release request stands, in one line and its colour. */
export interface ReleaseRequestState {
  tone: "amber" | "green" | "red" | "slate";
  text: string;
}

/**
 * The state of the job's newest request for a release, or null when there is nothing to say:
 *   waiting        "Asked 18.11. 14:02 — waiting for a manager" (somebody else's: "Asked by Jan Novák 18.11. 14:02 — …")
 *   approved       "Approved by Eva Malá 18.11. 15:10: agreed with the owner — release it now (valid until 25.11. 15:10)"
 *   used           "Released on Eva Malá's approval, by jan@firma.cz 19.11. 09:30" - only while the job IS released
 *   ran out        "The approval of 18.11. ran out unused" (it can be asked for again)
 *   rejected       "Rejected by Eva Malá 18.11. 15:10: not before the payment"
 *   closed         nothing: the job was released another way, and the request says nothing about that release
 * A released job says only on whose approval it was released; a job whose release was undone says nothing of the
 * approval that release used - it is spent, and the next release is asked for anew.
 */
export function releaseRequestState(
  request: ReleaseRequestFacts | null | undefined,
  opts: { released?: boolean; viewerId?: string | null } = {},
): ReleaseRequestState | null {
  if (!request || request.status === "closed") return null;
  if (request.status === "approved" && request.usedAt) {
    if (!opts.released) return null;
    const by = request.usedByName.trim() ? `, by ${request.usedByName.trim()}` : "";
    return { tone: "green", text: `Released on ${approver(request)}'s approval${by} ${shortDateTime(request.usedAt)}` };
  }
  if (opts.released) return null;
  if (request.status === "pending") {
    const mine = !!opts.viewerId && request.requestedById === opts.viewerId;
    const by = mine || !request.requestedByName.trim() ? "" : ` by ${request.requestedByName.trim()}`;
    return { tone: "amber", text: `Asked${by} ${shortDateTime(request.requestedAt)} — waiting for a manager` };
  }
  if (request.status === "approved" && !releasePassUsable(request)) {
    return { tone: "slate", text: `The approval of ${shortDate(request.decidedAt) || "a manager"} ran out unused` };
  }
  const approved = request.status === "approved";
  const head = [`${approved ? "Approved" : "Rejected"} by ${approver(request)}`, shortDateTime(request.decidedAt)].filter(Boolean).join(" ");
  const said = request.comment.trim() ? `${head}: ${request.comment.trim()}` : head;
  return approved ? { tone: "green", text: `${said} — release it now${validUntilText(request)}` } : { tone: "red", text: said };
}

/**
 * Whether a release may be asked for (again): not while a request for it waits for a manager, and not while an
 * approval can still be used - the server refuses both ("A release was already approved for this job: release it now").
 */
export const canAskForRelease = (latest: PassFacts | null | undefined): boolean => latest?.status !== "pending" && !releasePassUsable(latest);

/** The button once a request was answered and did not lead to the release: rejected, or approved and run out. */
export const askedBefore = (latest: PassFacts | null | undefined): boolean =>
  latest?.status === "rejected" || (latest?.status === "approved" && !latest.usedAt);

/** Whether the job's newest request for a release was used for it: the release went through on a manager's approval. */
export const releasedOnApproval = (latest: Pick<ReleaseRequestFacts, "status" | "usedAt"> | null | undefined): boolean =>
  latest?.status === "approved" && !!latest.usedAt;

/** What a release dialog says in place of the stop when a manager's approval stands: the release is not stopped. */
export const RELEASE_ON_APPROVAL_NOTE = "A manager approved this release: it goes through on that approval, recorded with the manager's name.";

/** The release button when the release goes through on a manager's approval. */
export const RELEASE_ON_APPROVAL_LABEL = "Release on the approval";

type AnswerFacts = Pick<
  ReleaseRequestFacts,
  "what" | "status" | "comment" | "usable" | "usedAt" | "usedByName" | "validUntil" | "closedWhy" | "closedAt" | "closedByName" | "closeReason"
>;

/**
 * An approval a manager took back after giving it (K20): the asker had been told it was approved, so the bell tells
 * them it no longer is. The server lists only those (api shipments repositories answersFor), never a request the
 * asker withdrew while it waited - it has no decision - nor one a release closed.
 */
export const isWithdrawnApproval = (a: Pick<ReleaseRequestFacts, "status" | "decidedAt" | "closedWhy">): boolean =>
  a.status === "closed" && a.closedWhy === "withdrawn" && !!a.decidedAt;

/**
 * The bell, for whoever asked: "Release approved · CZ00000053 — release it now (valid until 25.11. 15:10)" while
 * the approval can be used; a used or run-out approval and a rejection are plain answers; an approval a manager
 * withdrew says so with their reason: "Approval withdrawn: CZ00000053 — the customer cancelled".
 */
export function releaseAnswerTitle(a: AnswerFacts & { jobNumber: string; decidedAt: string | null }): string {
  if (isWithdrawnApproval(a)) {
    const why = (a.closeReason ?? "").trim();
    return `Approval withdrawn: ${a.jobNumber || "a job"}${why ? ` — ${why}` : ""}`;
  }
  const head = `Release ${a.status === "approved" ? "approved" : "rejected"} · ${a.jobNumber || "a job"}`;
  return releasePassUsable(a) ? `${head} — release it now${validUntilText(a)}` : head;
}

/**
 * The bell's second line: what was asked for and the manager's words - "House BoL release — agreed with the owner";
 * of an approval that was used "… — released 19.11. 09:30 by jan@firma.cz", of one that ran out "… — ran out unused",
 * of one withdrawn "… — no longer approved: ask again if it is still needed".
 */
export function releaseAnswerText(a: AnswerFacts & { decidedAt: string | null }): string {
  const what = RELEASE_WHAT_LABEL[a.what] ?? a.what;
  if (isWithdrawnApproval(a)) return `${what} — no longer approved: ask again if it is still needed`;
  if (a.status === "approved" && a.usedAt) return `${what} — released ${shortDateTime(a.usedAt)}${a.usedByName.trim() ? ` by ${a.usedByName.trim()}` : ""}`;
  if (a.status === "approved" && !releasePassUsable(a)) return `${what} — ran out unused`;
  return `${what}${a.comment.trim() ? ` — ${a.comment.trim()}` : ""}`;
}

/** Who gave the bell's word and when: the manager who answered - or, of an approval withdrawn, the one who withdrew it. */
export function releaseAnswerBy(a: Pick<ReleaseRequestFacts, "status" | "decidedAt" | "decidedByName" | "closedWhy" | "closedAt" | "closedByName">): { name: string; at: string | null } {
  if (isWithdrawnApproval(a)) return { name: (a.closedByName ?? "").trim() || "Manager", at: a.closedAt ?? null };
  return { name: a.decidedByName.trim() || "Manager", at: a.decidedAt };
}

/** What the bell lists: a manager's answers, and an approval a manager withdrew. A request still waiting or closed by a release is no answer. */
export const isReleaseAnswer = (a: Pick<ReleaseRequestFacts, "status"> & Partial<Pick<ReleaseRequestFacts, "decidedAt" | "closedWhy">>): boolean =>
  a.status === "approved" || a.status === "rejected" || isWithdrawnApproval({ status: a.status, decidedAt: a.decidedAt ?? null, closedWhy: a.closedWhy });

/**
 * What of the askers' answers the job's own request line is worded from: when it changes, a manager has answered
 * or an approval was used, and an open page reads its job's request again.
 */
export const releaseAnswersMark = (answers: readonly (Pick<ReleaseRequestFacts, "status" | "usable" | "usedAt"> & { id: string })[]): string =>
  answers.map((a) => `${a.id}:${a.status}:${a.usable ? 1 : 0}:${a.usedAt ?? ""}`).join("|");

/**
 * The Approvals tab's Answered list, under the answer: what became of an approval - "used 19.11. 09:30 by
 * jan@firma.cz", "not used yet, valid until 25.11. 15:10", "ran out unused" - and of a request the app closed
 * ("Closed: released without it"). Null for a rejection: its reason says it all.
 */
export function releaseAnsweredNote(r: AnswerFacts): string | null {
  if (r.status === "closed") return "Closed: released without it";
  if (r.status !== "approved") return null;
  if (r.usedAt) return `used ${shortDateTime(r.usedAt)}${r.usedByName.trim() ? ` by ${r.usedByName.trim()}` : ""}`;
  return releasePassUsable(r) ? `not used yet${r.validUntil ? `, valid until ${shortDateTime(r.validUntil)}` : ""}` : "ran out unused";
}

/** What approving does, said where a manager approves. */
export const RELEASE_APPROVAL_HINT = "Approving lets the job be released once within 7 days; the release itself is made by the user";

/** Why a manager is not offered an answer to a request of their own (the server's words). */
export const OWN_RELEASE_REQUEST = "You asked for this release yourself: another manager decides it";

/** Whether the signed-in user asked for this release themself: four eyes, another manager decides it. */
export const isOwnReleaseRequest = (r: Pick<ReleaseRequestFacts, "requestedById">, viewerId: string | null | undefined): boolean =>
  !!viewerId && r.requestedById === viewerId;

/**
 * Where a request leads - an answer under the bell, a row of the Approvals tab: the job. Its Details show where
 * both releases stand (the House BoL Release row, with Warehouse Released's request under it); the shipment's
 * Warehouse tab shows neither. Warehouse Released itself is set from Warehouse → Stock (WAREHOUSE_RELEASE_HREF).
 */
export const releaseRequestHref = (r: { shipmentId: string }): string => `/shipments/${r.shipmentId}`;

/** Where the cargo is released from the warehouse: Stock → release to a truck. */
export const WAREHOUSE_RELEASE_HREF = "/warehouse/stock";
