import { addDays } from "../../../lib/businessDate";
import { round2 } from "./invoiceCalc";
import { variableSymbol } from "./invoicePdf";
import { MIN_REASON } from "./receivables";
import type { BankEntryAllocation, BankEntryCandidate, BankEntryStatus } from "../schemas/bankStatement.schema";

// Which invoices a bank entry may pay (the bank statement import, step 7). Pure. Only a proposal: nothing here ever
// notes a payment; a manager confirms each entry (D11). The app's payment reference (variabilní symbol) is the job
// number's digits (lib/invoicePdf variableSymbol), shared by every invoice of the job, so a symbol alone may name
// several invoices, and the invoice number in the payer's message ranks above it.

/** An invoice still owed, as Accounts Receivable shows it now. */
export interface OpenInvoice {
  invoiceId: string;
  number: string;
  customer: string;
  jobNumber: string;
  leftToPay: number;
  currency: string;
  dueDate: string;
  /** The receivable's version (a confirm sends it back) */
  version: number;
  /**
   * The first day a payment of it may be booked on (payableFromOf): an entry booked earlier is not proposed for it,
   * as a confirm would refuse it (mock test council Y2). null or left out: any day (an invoice on prepayment).
   */
  payableFrom?: string | null;
}

export interface MatchableEntry {
  credit: boolean;
  amount: number;
  currency: string;
  variableSymbol: string;
  endToEndId: string;
  message: string;
  /** The day it was booked (the day a confirm notes as paid); null or left out: not known, no invoice is left out for it */
  day?: string | null;
}

/**
 * The first day a payment of an invoice may be booked on - the day a payment may be noted from (lib/receivables
 * paymentProblem): its issue day; any day for an invoice on prepayment (the customer pays before it is issued); for an
 * invoice issued again after a credit note, the day the invoice it replaces was issued (the customer may have paid
 * that one). Mock test council Y2.
 */
export function payableFromOf(inv: { issueDate: string | null; prepayment?: boolean; issuedAgainFrom?: string | null }): string | null {
  if (inv.prepayment || !inv.issueDate) return null;
  return inv.issuedAgainFrom && inv.issuedAgainFrom < inv.issueDate ? inv.issuedAgainFrom : inv.issueDate;
}

/** A candidate as stored (BankEntryCandidate) with what the screen needs now. */
export type MatchedCandidate = BankEntryCandidate & { dueDate: string; version: number };

export const CANDIDATE_LIMIT = 20;

export const REASON_NUMBER = "Invoice number in the payment";
export const REASON_AMOUNT = "Exact amount left to pay";
export const REASON_SYMBOL = "Variable symbol";

// The invoice number in the message outweighs an exact amount, which outweighs the symbol alone.
const SCORE_NUMBER = 4;
const SCORE_AMOUNT = 2;
const SCORE_SYMBOL = 1;

/** Two symbols are the same number (banks drop leading zeros: 00000028 = 28); an empty or all-zero one matches nothing. */
export function sameSymbol(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!/^\d+$/.test(x) || !/^\d+$/.test(y)) return false;
  const nx = x.replace(/^0+/, "");
  const ny = y.replace(/^0+/, "");
  return nx !== "" && nx === ny;
}

const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Whether the invoice number appears in the texts, spaces, dashes and case aside ("inv 2026CZ00000028-001"), also
 * without its letter prefix ("2026CZ00000028-001"), never as part of a longer number (…-0012 is not …-001).
 */
export function invoiceNumberIn(number: string, texts: readonly string[]): boolean {
  const full = compact(number);
  if (full.length < 6) return false;
  const bare = full.replace(/^[A-Z]+/, "");
  const runsOn = (h: string, at: number, f: string) => /\d/.test(h[at + f.length] ?? "");
  const wholes = texts.flatMap((t) => [compact(t), ...t.split(/[\s,;]+/).map(compact)]).filter(Boolean);
  // The full number anywhere, as long as it does not run on into more digits.
  const fullFound = wholes.some((h) => {
    for (let at = h.indexOf(full); at >= 0; at = h.indexOf(full, at + 1)) if (!runsOn(h, at, full)) return true;
    return false;
  });
  if (fullFound || bare.length < 6 || bare === full) return fullFound;
  // Without its prefix only at the start of a word: "CN2026CZ00000028-001" (a credit note) is not the invoice.
  return texts.some((t) =>
    t
      .split(/[\s,;:/]+/)
      .map(compact)
      .some((h) => h.startsWith(bare) && !runsOn(h, 0, bare)),
  );
}

const cents = (n: number) => Math.round(n * 100);

/**
 * What an entry is now: money out → not_incoming; money in → the owed invoices in its currency whose job's symbol is
 * its variable symbol or whose number is in its message or end-to-end id, best first (at most 20) → proposed, or
 * no_match when none. An invoice the entry was booked too early for (before its payableFrom) is left out. Never
 * confirmed here.
 */
export function matchEntry(
  entry: MatchableEntry,
  invoices: readonly OpenInvoice[],
): { status: Extract<BankEntryStatus, "proposed" | "no_match" | "not_incoming">; candidates: MatchedCandidate[] } {
  if (!entry.credit) return { status: "not_incoming", candidates: [] };
  const texts = [entry.message, entry.endToEndId].filter(Boolean);
  const out: MatchedCandidate[] = [];
  for (const inv of invoices) {
    if (inv.currency !== entry.currency || !(inv.leftToPay > 0)) continue;
    if (entry.day && inv.payableFrom && entry.day < inv.payableFrom) continue;
    const byNumber = invoiceNumberIn(inv.number, texts);
    const bySymbol = !!entry.variableSymbol && sameSymbol(entry.variableSymbol, variableSymbol(inv.jobNumber));
    if (!byNumber && !bySymbol) continue;
    const exact = cents(entry.amount) === cents(inv.leftToPay);
    const reasons = [
      ...(byNumber ? [REASON_NUMBER] : []),
      ...(exact ? [REASON_AMOUNT] : []),
      ...(bySymbol ? [`${REASON_SYMBOL} ${entry.variableSymbol.replace(/^0+/, "")}`] : []),
    ];
    out.push({
      invoiceId: inv.invoiceId,
      number: inv.number,
      customer: inv.customer,
      jobNumber: inv.jobNumber,
      leftToPay: round2(inv.leftToPay),
      currency: inv.currency,
      reasons,
      score: (byNumber ? SCORE_NUMBER : 0) + (exact ? SCORE_AMOUNT : 0) + (bySymbol ? SCORE_SYMBOL : 0),
      dueDate: inv.dueDate,
      version: inv.version,
    });
  }
  out.sort((a, b) => b.score - a.score || a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number));
  const candidates = out.slice(0, CANDIDATE_LIMIT);
  return { status: candidates.length ? "proposed" : "no_match", candidates };
}

/** An incoming bank entry no manager has decided yet (proposed or no match), as the "payment waiting" check reads it. */
export interface OpenBankEntry extends MatchableEntry {
  statementId: string;
  /** The statement file it was read from */
  fileName: string;
  bookingDate: string | null;
  /** The day the statement was read: the entry's day when it has no booking date */
  readOn?: string | null;
}

/** An owed invoice as the "payment waiting" check reads it: with its issue day, and what lets an earlier entry pay it. */
export interface WaitingInvoice extends OpenInvoice {
  issueDate: string | null;
  /** The customer's terms on the invoice are prepayment: an entry booked before it was issued may pay it (Y2) */
  prepayment?: boolean;
  /** Issued again after a credit note: the day the invoice it replaces was issued (Y2) */
  issuedAgainFrom?: string | null;
}

/** An open entry booked longer ago than this no longer holds an invoice's reminders. */
export const WAITING_ENTRY_DAYS = 30;

/** A payment that may be for the invoice, waiting on a bank statement for a manager to confirm it. */
export interface WaitingPayment {
  statementId: string;
  fileName: string;
  bookingDate: string | null;
  amount: number;
  currency: string;
}

/**
 * Mock test council X5 (19 Nov 2026): the invoices an open bank entry may pay, each with the entry - the oldest booked
 * first. "May pay" is the statement's own proposal (matchEntry), worked out again against the invoices as they are
 * now, so an invoice issued after the file was read is found too. The automatic reminders leave such an invoice alone;
 * the drawer and the reminder form say so.
 *
 * The variable symbol is the job number, shared by all the job's invoices, so an entry nobody decides would otherwise
 * hold every later invoice of the job for good: an entry booked before the invoice was issued is not its payment -
 * unless the invoice is on prepayment (the customer pays before it is issued) or issued again after a credit note (the
 * customer may have paid the one it replaces; then from that one's issue day): payableFromOf, the same day a confirm
 * accepts (mock test council Y2). One booked more than WAITING_ENTRY_DAYS before `today` holds nothing any more, the
 * early ones too (it waits on its statement all the same).
 */
export function waitingPaymentsOf(entries: readonly OpenBankEntry[], invoices: readonly WaitingInvoice[], today: string): Map<string, WaitingPayment> {
  const out = new Map<string, WaitingPayment>();
  if (!invoices.length) return out;
  const oldest = addDays(today, -WAITING_ENTRY_DAYS);
  const dayOf = (e: OpenBankEntry) => e.bookingDate ?? e.readOn ?? null;
  const ordered = [...entries]
    .filter((e) => e.credit && !((dayOf(e) ?? today) < oldest))
    .sort((a, b) => (a.bookingDate ?? "9999").localeCompare(b.bookingDate ?? "9999"));
  const payable = invoices.map((inv) => ({ ...inv, payableFrom: payableFromOf(inv) }));
  for (const e of ordered) {
    // An entry of no known day is held against every invoice, as before.
    for (const c of matchEntry({ ...e, day: dayOf(e) }, payable).candidates) {
      if (out.has(c.invoiceId)) continue;
      out.set(c.invoiceId, { statementId: e.statementId, fileName: e.fileName, bookingDate: e.bookingDate, amount: round2(e.amount), currency: e.currency });
    }
  }
  return out;
}

/** "A payment that may be for this invoice is waiting on bank statement x.xml (booked 12.11.2026, 1,210.00 EUR): …" */
export function waitingPaymentText(w: WaitingPayment): string {
  const booked = w.bookingDate ? `booked ${w.bookingDate.slice(8, 10)}.${w.bookingDate.slice(5, 7)}.${w.bookingDate.slice(0, 4)}, ` : "";
  return `A payment that may be for this invoice is waiting on bank statement ${w.fileName || "(no name)"} (${booked}${round2(w.amount).toFixed(2)} ${w.currency}): a manager confirms it there`;
}

/** A candidate as it is stored (the version and due day are read fresh whenever the statement is opened). */
export const storedCandidate = ({ dueDate: _d, version: _v, ...c }: MatchedCandidate): BankEntryCandidate => c;

export const DECIDABLE: readonly BankEntryStatus[] = ["proposed", "no_match"];

/** Whether an entry can still be confirmed or ignored; the message when not. */
export function decidableProblem(entry: { status: BankEntryStatus; decidedBy: string; decidedOn: string | null }): string | null {
  if (DECIDABLE.includes(entry.status)) return null;
  const who = entry.decidedBy ? ` by ${entry.decidedBy}` : "";
  const when = entry.decidedOn ? ` on ${entry.decidedOn}` : "";
  if (entry.status === "confirmed") return `This entry was confirmed already${who}${when}`;
  if (entry.status === "ignored") return `This entry was set aside already${who}${when}`;
  return "This entry is money out of the account: it is not a customer's payment";
}

/** What a confirmed entry's allocations stand at now that some of its payments may have been taken back. */
export interface EntryAllocationState {
  /** Allocated on payments not taken back */
  live: number;
  /** The entry's amount less what is live and what went back (a reversed payment): what a new confirmation may put on invoices */
  free: number;
  /** Confirmed, a payment of it taken back by mistake since, and something free: a manager may confirm it again (or set it aside) */
  reopened: boolean;
  /** The allocations of the latest confirmation (a double click of it is answered, not noted twice) */
  lastRound: BankEntryAllocation[];
  /** The number of the next confirmation (its idempotency keys are `bank:<entryId>:<round>` from the second one on) */
  nextRound: number;
}

/**
 * `takenBack`: the entry's payments taken back since. `reversed`: those of them taken back as reversed (mock test council
 * P8: a bank return or a refund) - the money went back to the customer, so it is not free on the entry to put on
 * another invoice; only a payment noted by mistake frees its amount.
 */
export function entryAllocationState(
  entry: { status: BankEntryStatus; amount: number; allocations: readonly BankEntryAllocation[] },
  takenBack: ReadonlySet<string>,
  reversed: ReadonlySet<string> = new Set(),
): EntryAllocationState {
  const roundOf = (a: BankEntryAllocation) => (Number.isInteger(a.round) && a.round! > 0 ? a.round! : 1);
  const live = entry.allocations.filter((a) => !takenBack.has(a.paymentId)).reduce((sum, a) => sum + cents(Number(a.amount)), 0);
  const gone = entry.allocations.filter((a) => takenBack.has(a.paymentId) && reversed.has(a.paymentId)).reduce((sum, a) => sum + cents(Number(a.amount)), 0);
  const free = Math.max(0, cents(entry.amount) - live - gone);
  const last = entry.allocations.reduce((max, a) => Math.max(max, roundOf(a)), 0);
  const anyTakenBack = entry.allocations.some((a) => takenBack.has(a.paymentId) && !reversed.has(a.paymentId));
  return {
    live: live / 100,
    free: free / 100,
    reopened: entry.status === "confirmed" && anyTakenBack && free > 0,
    lastRound: entry.allocations.filter((a) => roundOf(a) === last),
    nextRound: last + 1,
  };
}

/** The idempotency key prefix of an entry's n-th confirmation: the first keeps `bank:<entryId>`, each later one its own. */
export const bankKeyPrefix = (entryId: string, round: number) => (round <= 1 ? `bank:${entryId}` : `bank:${entryId}:${round}`);

export interface AllocationItem {
  invoiceId: string;
  amount: number;
}

export const MAX_ALLOCATIONS = 100;

/**
 * A manager's allocation of an incoming entry: one or several invoices, each once, each amount above 0 with at most
 * 2 decimals and at most what is left to pay on it, every invoice owed and in the entry's currency, together at most
 * the entry's amount. `invoices` are the invoices as read now (an invoice missing there is not owed).
 */
export function allocationProblem(
  entry: { amount: number; currency: string },
  items: readonly AllocationItem[],
  invoices: ReadonlyMap<string, { number: string; leftToPay: number; currency: string; owed: boolean }>,
): string | null {
  if (!items.length) return "Choose at least one invoice this payment pays";
  if (items.length > MAX_ALLOCATIONS) return `At most ${MAX_ALLOCATIONS} invoices in one payment`;
  const ids = new Set<string>();
  let total = 0;
  for (const item of items) {
    if (ids.has(item.invoiceId)) return "An invoice is chosen twice: give it one amount";
    ids.add(item.invoiceId);
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) return "Each amount must be above 0";
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return "An amount has at most 2 decimals";
    const inv = invoices.get(item.invoiceId);
    if (!inv || !inv.owed) return `${inv?.number ?? "An invoice chosen"} is not owed any more: open the statement again`;
    if (inv.currency !== entry.currency) return `${inv.number} is in ${inv.currency}, the payment in ${entry.currency}`;
    if (cents(amount) > cents(inv.leftToPay)) return `More than is left to pay on ${inv.number} (${round2(inv.leftToPay).toFixed(2)} ${inv.currency})`;
    total += cents(amount);
  }
  if (total > cents(entry.amount)) return `Together more than the payment (${round2(entry.amount).toFixed(2)} ${entry.currency})`;
  return null;
}

/** Setting an entry aside needs a reason of at least 3 characters. */
export function ignoreProblem(reason: string): string | null {
  return reason.trim().length < MIN_REASON ? "Say why this entry is set aside" : null;
}
