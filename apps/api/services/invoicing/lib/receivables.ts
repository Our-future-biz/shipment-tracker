import { addDays, businessDay, isRealYmd } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { qtyOrOne, round2 } from "./invoiceCalc";
import { daysOverdue, sumByCurrency } from "./supplierInvoices";
import type { AgingBucket, ReceivableLineKind, ReceivableMark, ReceivableMilestone, ReceivableStatus } from "../interfaces/interfaces";

/**
 * Accounts Receivable's rules (Council Outlay 10, D1–D26 as recommended, 18 Nov 2026; step 7 the same day), kept pure so
 * they can be tested on their own: what an invoice is owed after its credit notes, payments, write-offs and bank
 * charges, its status, marks and age, when a payment, a write-off, its confirmation, a take-back or a note may be
 * written, the release warning and stop, the bell, the month-end list as at a day and the work not yet invoiced.
 * Amounts are numbers in the invoice's currency, rounded to 2 decimals; days are YYYY-MM-DD, "today" the Prague
 * business day.
 */

// The same day count and per-currency sums as Accounts Payable: one rule each.
export { daysOverdue, sumByCurrency };

/** An amount rounded to 2 decimals, never −0 (a sum that comes to nothing reads 0). */
const money = (v: number): number => round2(v) || 0;

/** The shortest reason a take-back, a dispute or its end, a write-off or a bank charge may give. */
export const MIN_REASON = 3;

/** Money the customer paid: a payment, or one carried over from the customer's list. */
export const isMoneyKind = (kind: string | undefined | null): boolean => !kind || kind === "payment" || kind === "carried_over";

/** A write-off or a bank charge (step 7, D13): counted only once a second manager confirms it. */
export const isWriteOffKind = (kind: string | undefined | null): kind is "write_off" | "bank_charge" => kind === "write_off" || kind === "bank_charge";

/** A line as the sums read it; a line with no kind is a payment (as every line was before step 7). */
export interface CountedLine {
  kind?: string;
  amount: number | string;
  takenBackAt: Date | string | null;
  confirmedAt?: Date | string | null;
}

/**
 * Whether a line counts toward the invoice now: not taken back, and money (counted at once) or a write-off / bank
 * charge a second manager confirmed.
 */
export const countsNow = (line: CountedLine): boolean => !line.takenBackAt && (isMoneyKind(line.kind) || !!line.confirmedAt);

/** A write-off or bank charge waiting for a second manager: not confirmed, not taken back. */
export const isWaiting = (line: CountedLine): boolean => isWriteOffKind(line.kind) && !line.takenBackAt && !line.confirmedAt;

/** What its credit notes took off an invoice: −Σ of their gross (credit notes carry a negative gross), a positive number. */
export function creditedOf(creditNoteGross: readonly (number | string)[]): number {
  return money(-creditNoteGross.reduce<number>((s, g) => s + Number(g), 0));
}

const sumOf = (lines: readonly CountedLine[]) => money(lines.reduce<number>((s, l) => s + Number(l.amount), 0));

/** What the live payments paid: money only (a payment taken back pays nothing; a write-off is not money). */
export function paidOf(payments: readonly CountedLine[]): number {
  return sumOf(payments.filter((p) => isMoneyKind(p.kind) && countsNow(p)));
}

/** The confirmed, live write-offs and bank charges of an invoice, apart, and what waits for a second manager. */
export function settledOtherOf(lines: readonly CountedLine[]): { writtenOff: number; bankCharges: number; waiting: number } {
  return {
    writtenOff: sumOf(lines.filter((l) => l.kind === "write_off" && countsNow(l))),
    bankCharges: sumOf(lines.filter((l) => l.kind === "bank_charge" && countsNow(l))),
    waiting: sumOf(lines.filter(isWaiting)),
  };
}

/** The confirmed write-offs and bank charges together (missing ones read 0). */
export const settledOther = (f: { writtenOff?: number | null; bankCharges?: number | null }): number => money((f.writtenOff ?? 0) + (f.bankCharges ?? 0));

/** The latest day money was paid on (null when none, or only one carried over with no day; a write-off is not a payment). */
export function lastPaidOnOf(payments: readonly { kind?: string; paidOn: string | null; takenBackAt: Date | string | null }[]): string | null {
  let last: string | null = null;
  for (const p of payments) if (isMoneyKind(p.kind) && !p.takenBackAt && p.paidOn && (!last || p.paidOn > last)) last = p.paidOn;
  return last;
}

/**
 * What is left to pay: the invoice with VAT, less its credit notes, its payments and its confirmed write-offs and bank
 * charges; below 0 is to refund. A cancelled invoice is not owed at all (withdrawn on its issue day): only a payment
 * noted on it would be left, to refund.
 */
export function leftToPayOf(input: { invoiceStatus: string; gross: number; credited: number; paid: number; settledOther?: number }): number {
  const owed = input.invoiceStatus === "cancelled" ? 0 : input.gross;
  return money(owed - input.credited - input.paid - (input.settledOther ?? 0));
}

/**
 * The status (D3, step 7): Credited and Cancelled come from the invoice itself, the rest from what is left to pay. Nothing
 * left: Paid when money was paid, Written off when only confirmed write-offs / bank charges closed it, else Credited.
 */
export function statusOf(input: { invoiceStatus: string; leftToPay: number; paid: number; settledOther?: number }): ReceivableStatus {
  const other = input.settledOther ?? 0;
  if (input.invoiceStatus === "cancelled") return "cancelled";
  if (input.invoiceStatus === "credited") return "credited";
  if (input.leftToPay <= 0) return input.paid > 0 ? "paid" : other > 0 ? "written_off" : "credited";
  return input.paid > 0 || other > 0 ? "part_paid" : "unpaid";
}

/** Still owed: unpaid or part paid, with something left to pay. */
export const isOwed = (s: { status: ReceivableStatus; leftToPay: number }) => s.leftToPay > 0 && (s.status === "unpaid" || s.status === "part_paid");

/** Overdue (D10): owed, and the due day before today (Prague). Never stored. */
export const isOverdue = (s: { status: ReceivableStatus; leftToPay: number; dueDate: string }, today: string) => isOwed(s) && s.dueDate < today;

/** The customer is on prepayment: the payment terms on the invoice say so (D22). */
export const isPrepayment = (paymentTerms: string | null | undefined) => /prepay/i.test(paymentTerms ?? "");

/** The age of what is left to pay; null when nothing is. */
export function agingBucketOf(leftToPay: number, overdueDays: number): AgingBucket | null {
  if (leftToPay <= 0) return null;
  if (overdueDays <= 0) return "current";
  if (overdueDays <= 30) return "1-30";
  if (overdueDays <= 60) return "31-60";
  if (overdueDays <= 90) return "61-90";
  return "90+";
}

export interface ReceivableInput {
  /** The invoice's own status: issued, credited or cancelled */
  invoiceStatus: string;
  gross: number;
  credited: number;
  /** Money paid: live payments and carried over */
  paid: number;
  /** Confirmed, live write-offs (step 7; none when left out) */
  writtenOff?: number;
  /** Confirmed, live bank charges (step 7; none when left out) */
  bankCharges?: number;
  /** Write-offs and bank charges waiting for a second manager (they count for nothing yet) */
  waiting?: number;
  dueDate: string;
  paymentTerms: string;
  promisedOn: string | null;
  disputed: boolean;
  reminderLevel: number;
  /** A customer_invoice follow-up of this invoice failed for good: it is not in the customer's list */
  customerListFailed: boolean;
}

export interface ReceivableState {
  credited: number;
  paid: number;
  writtenOff: number;
  bankCharges: number;
  leftToPay: number;
  status: ReceivableStatus;
  daysOverdue: number;
  agingBucket: AgingBucket | null;
  marks: ReceivableMark[];
}

/** Everything the row shows of an invoice, worked out from it, its credit notes, payments, write-offs and chasing. */
export function receivableStateOf(input: ReceivableInput, today: string): ReceivableState {
  const credited = money(input.credited);
  const paid = money(input.paid);
  const writtenOff = money(input.writtenOff ?? 0);
  const bankCharges = money(input.bankCharges ?? 0);
  const other = money(writtenOff + bankCharges);
  const leftToPay = leftToPayOf({ invoiceStatus: input.invoiceStatus, gross: input.gross, credited, paid, settledOther: other });
  const status = statusOf({ invoiceStatus: input.invoiceStatus, leftToPay, paid, settledOther: other });
  const overdue = isOverdue({ status, leftToPay, dueDate: input.dueDate }, today);
  const days = overdue ? daysOverdue(input.dueDate, today) : 0;
  const marks: ReceivableMark[] = [];
  if (overdue) marks.push("overdue");
  if (credited > 0 && status !== "credited" && status !== "cancelled") marks.push("part_credited");
  if (leftToPay < 0) marks.push("to_refund");
  if (isPrepayment(input.paymentTerms)) marks.push("prepayment");
  if (input.promisedOn && leftToPay > 0) marks.push(input.promisedOn >= today ? "promised" : "promise_broken");
  // A dispute is about money still owed (mock test council n4, L5): once nothing is, it is not shown (and the next
  // read closes it, receivable.repository closeSettledDisputes).
  if (input.disputed && isOwed({ status, leftToPay })) marks.push("disputed");
  if (input.reminderLevel > 0) marks.push("reminded");
  if (input.customerListFailed) marks.push("not_in_customer_list");
  if ((input.waiting ?? 0) > 0) marks.push("write_off_waiting");
  if (writtenOff > 0 && paid > 0) marks.push("part_written_off");
  if (bankCharges > 0) marks.push("bank_charge");
  return { credited, paid, writtenOff, bankCharges, leftToPay, status, daysOverdue: days, agingBucket: agingBucketOf(leftToPay, days), marks };
}

/**
 * The amount a payment carried over from the customer's list pays (D15): what the invoice is owed after its credit notes;
 * null when nothing is (then no payment is written).
 */
export function carriedOverAmount(gross: number, credited: number): number | null {
  const amount = money(gross - credited);
  return amount > 0 ? amount : null;
}

/**
 * What the customer's list is told of an invoice (the receivable_state follow-up): what is left to pay after everything
 * that counts (a confirmed write-off too), and settled when nothing is.
 */
export function customerListStateOf(input: { invoiceStatus: string; gross: number; credited: number; paid: number; settledOther?: number }): { leftToPay: number; settled: boolean } {
  const leftToPay = leftToPayOf(input);
  return { leftToPay, settled: leftToPay <= 0 };
}

/** An amount as a payment takes it: a finite number above 0, at most 2 decimals, that fits numeric(14,2). */
export function amountProblem(amount: number): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "The amount must be a number";
  if (amount <= 0) return "The amount must be above 0";
  if (Math.abs(round2(amount) - amount) > 1e-9) return "The amount may have at most 2 decimal places";
  if (amount >= 1e12) return "The amount is too large";
  return null;
}

/** Why a payment may not be noted, or null (D11, D12). */
export function paymentProblem(input: {
  invoiceStatus: string;
  paidOn: string;
  amount: number;
  leftToPay: number;
  currency: string;
  issueDate: string;
  today: string;
  /** The invoice is on prepayment: the customer often pays before it is issued, so an earlier day is allowed */
  prepayment?: boolean;
  /**
   * The invoice was issued again after a credit note (mock test council Y2): the day the invoice it replaces was issued.
   * The customer may have paid that one, so a day from then on is allowed.
   */
  issuedAgainFrom?: string | null;
}): string | null {
  if (input.invoiceStatus === "credited") return "This invoice is credited: no payment is noted on it";
  if (input.invoiceStatus === "cancelled") return "This invoice was cancelled: it is not owed";
  if (input.invoiceStatus !== "issued") return "Only an issued invoice takes a payment";
  if (!isRealYmd(input.paidOn)) return "The day it was paid must be a date (yyyy-mm-dd)";
  if (input.paidOn > input.today) return "The day it was paid cannot be after today";
  if (input.paidOn < input.issueDate && !input.prepayment) {
    const from = input.issuedAgainFrom && input.issuedAgainFrom < input.issueDate ? input.issuedAgainFrom : null;
    if (!from) return `The day it was paid cannot be before the invoice was issued (${input.issueDate})`;
    if (input.paidOn < from) return `The day it was paid cannot be before the invoice this one replaces was issued (${from})`;
  }
  const bad = amountProblem(input.amount);
  if (bad) return bad;
  if (input.leftToPay <= 0) return "Nothing is left to pay on this invoice";
  if (round2(input.amount) > round2(input.leftToPay)) return `More than is left to pay (${round2(input.leftToPay).toFixed(2)} ${input.currency})`;
  return null;
}

/** How a line is named in a message. */
export const lineWord = (kind: string | undefined | null): string => (kind === "write_off" ? "write-off" : kind === "bank_charge" ? "bank charge" : "payment");

/** How a line is taken back (P8): noted by mistake (it never counted), or reversed on a day (it counted until then). */
export type TakeBackKind = "mistake" | "reversed";
export const TAKE_BACK_KINDS: readonly TakeBackKind[] = ["mistake", "reversed"];

/**
 * Why a line (a payment, or a write-off / bank charge, confirmed or waiting) may not be taken back, or null. Mock test
 * council P8: a payment is taken back as noted by mistake, or as reversed on a day - a bank return or a refund, the money
 * came and went back - not before the day it was paid, not after today. A write-off or bank charge is only ever taken
 * back as a mistake (no money moved). No kind given (an older caller): a mistake.
 */
export function takeBackProblem(input: {
  reason: string;
  takenBackAt: Date | string | null;
  kind?: string;
  takeBackKind?: string | null;
  reversedOn?: string | null;
  paidOn?: string | null;
  today?: string;
}): string | null {
  const word = lineWord(input.kind);
  const how = input.takeBackKind || "mistake";
  if (!TAKE_BACK_KINDS.includes(how as TakeBackKind)) return "A take-back is noted by mistake or reversed on a day";
  if (input.reason.trim().length < MIN_REASON) return `Say why the ${word} is taken back`;
  if (input.takenBackAt) return `This ${word} was taken back already`;
  if (how === "mistake") return input.reversedOn?.trim() ? "A payment noted by mistake has no day it went back" : null;
  if (!isMoneyKind(input.kind)) return `Only a payment is reversed: a ${word} taken back is a mistake`;
  const day = (input.reversedOn ?? "").trim();
  if (!day) return "Give the day the payment went back (the bank return or the refund)";
  if (!isRealYmd(day)) return "The day it went back must be a date (yyyy-mm-dd)";
  if (input.today && day > input.today) return "The day it went back cannot be after today";
  if (input.paidOn && day < input.paidOn) return `The day it went back cannot be before it was paid (${input.paidOn})`;
  return null;
}

// ── Write-offs and bank charges (step 7, D13) ──

export type WriteOffKind = "write_off" | "bank_charge";
export const WRITE_OFF_KINDS: readonly WriteOffKind[] = ["write_off", "bank_charge"];

/**
 * Why a manager may not write off what is left (or close it as a bank charge), or null: a reason, an amount above 0 and
 * at most what is left to pay less what already waits for a second manager (two waiting lines can't close more than is
 * owed), on an issued invoice. Its day is today.
 */
export function writeOffProblem(input: {
  kind: string;
  invoiceStatus: string;
  amount: number;
  reason: string;
  /** What is left to pay now (the waiting lines count for nothing in it) */
  leftToPay: number;
  /** Write-offs and bank charges on it waiting for a second manager */
  waiting: number;
  currency: string;
}): string | null {
  if (!isWriteOffKind(input.kind)) return "A write-off line is a write-off or a bank charge";
  const word = lineWord(input.kind);
  if (input.reason.trim().length < MIN_REASON) return `Say why the ${word} closes what is left`;
  if (input.invoiceStatus === "credited") return "This invoice is credited: nothing is written off on it";
  if (input.invoiceStatus === "cancelled") return "This invoice was cancelled: it is not owed";
  if (input.invoiceStatus !== "issued") return "Only an issued invoice takes a write-off";
  const bad = amountProblem(input.amount);
  if (bad) return bad;
  if (input.leftToPay <= 0) return "Nothing is left to pay on this invoice";
  const room = money(input.leftToPay - input.waiting);
  if (room <= 0) return "What is left to pay already waits to be written off: a second manager confirms it, or it is taken back";
  if (round2(input.amount) > room) {
    return input.waiting > 0
      ? `More than is left to pay once what waits for a second manager is counted (${room.toFixed(2)} ${input.currency})`
      : `More than is left to pay (${room.toFixed(2)} ${input.currency})`;
  }
  return null;
}

/**
 * Whether this manager may confirm a waiting write-off or bank charge, or why not (D13): another manager confirms it;
 * the manager who wrote it only when the company has no other manager (then it is marked self-confirmed). It must
 * still fit what is left to pay (a payment noted meanwhile counts).
 */
export function confirmProblem(input: {
  line: { kind: string; amount: number | string; byUserId: string | null; confirmedAt: Date | string | null; takenBackAt: Date | string | null };
  confirmerUserId: string;
  /** The company has an active manager other than the one confirming */
  anotherManager: boolean;
  invoiceStatus: string;
  /** What is left to pay now (this line not counted: it waits) */
  leftToPay: number;
  currency: string;
}): { problem: string | null; selfConfirmed: boolean } {
  const { line } = input;
  const word = lineWord(line.kind);
  if (!isWriteOffKind(line.kind)) return { problem: "Only a write-off or a bank charge is confirmed", selfConfirmed: false };
  if (line.takenBackAt) return { problem: `This ${word} was taken back`, selfConfirmed: false };
  if (line.confirmedAt) return { problem: `This ${word} is confirmed already`, selfConfirmed: false };
  const own = !!line.byUserId && line.byUserId === input.confirmerUserId;
  if (own && input.anotherManager) return { problem: `You wrote this ${word}: another manager confirms it`, selfConfirmed: false };
  if (input.invoiceStatus !== "issued") return { problem: `This invoice is ${input.invoiceStatus === "cancelled" ? "cancelled" : "credited"}: take the ${word} back`, selfConfirmed: false };
  if (round2(Number(line.amount)) > round2(input.leftToPay)) {
    return { problem: `More than is left to pay now (${money(Math.max(0, input.leftToPay)).toFixed(2)} ${input.currency}): take the ${word} back and write it again`, selfConfirmed: false };
  }
  return { problem: null, selfConfirmed: own };
}

/** Whether a user may confirm a waiting line (the button): a manager, and not its writer while another manager exists. */
export const mayConfirm = (input: { manager: boolean; byUserId: string | null; userId: string; anotherManager: boolean }): boolean =>
  input.manager && (!input.byUserId || input.byUserId !== input.userId || !input.anotherManager);

// ── One bank payment over several invoices (step 7) ──

export const BATCH_MAX = 100;

export interface BatchItemInput {
  invoiceId: string;
  version: number;
  amount: number;
}

/**
 * Why a bank payment over several invoices is refused before anything is read, or null: 1 to 100 items, each invoice
 * once, a version and an amount each (above 0, at most 2 decimals), and the day a real date.
 */
export function batchProblem(input: { paidOn: string; items: readonly BatchItemInput[] }): string | null {
  if (!isRealYmd(input.paidOn)) return "The day it was paid must be a date (yyyy-mm-dd)";
  if (!Array.isArray(input.items) || input.items.length === 0) return "Choose at least one invoice the payment pays";
  if (input.items.length > BATCH_MAX) return `One payment covers at most ${BATCH_MAX} invoices`;
  const seen = new Set<string>();
  for (const item of input.items) {
    if (!isUuid(item.invoiceId)) return "An invoice of the payment is not there";
    if (seen.has(item.invoiceId)) return "The same invoice is twice in one payment: give it one amount";
    seen.add(item.invoiceId);
    if (!Number.isInteger(item.version)) return "Each invoice needs the version that was seen";
    const bad = amountProblem(item.amount);
    if (bad) return bad;
  }
  return null;
}

/** One bank payment is in one currency: the invoices it pays must all be in it (and in the bank's, when given). */
export function batchCurrencyProblem(currencies: readonly string[], expected?: string | null): string | null {
  const distinct = [...new Set(currencies)];
  if (expected && distinct.some((c) => c !== expected)) return `The payment is in ${expected}: every invoice it pays must be in ${expected}`;
  if (distinct.length > 1) return `One payment is in one currency: these invoices are in ${distinct.sort().join(" and ")}`;
  return null;
}

export type NoteKind = "note" | "promise" | "dispute" | "dispute_closed" | "reminder";
export const NOTE_KINDS: readonly NoteKind[] = ["note", "promise", "dispute", "dispute_closed", "reminder"];

/** "Invalid": the note itself is wrong; "state": the invoice is not in a state to take it; "forbidden": not for this user. */
export interface NoteProblem {
  kind: "invalid" | "state" | "forbidden";
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How far ahead a user may note a promise to pay (mock test council K13); a manager may go further. */
export const PROMISE_MAX_DAYS = 60;

/**
 * Why a dispute closed by itself (n4, L5): nothing is left to pay, and why not. Mock test council n5: worded from what
 * settled it - "paid" only when money alone did; a payment with a credit note, a write-off or a bank charge names each
 * with its amount ("paid 700.00, credited 300.00 EUR"). Without the amounts (an older caller) as before.
 */
export function settledDisputeReason(input: {
  invoiceStatus: string;
  status: ReceivableStatus;
  paid?: number;
  credited?: number;
  writtenOff?: number;
  bankCharges?: number;
  currency?: string;
}): string {
  if (input.invoiceStatus === "cancelled" || input.status === "cancelled") return "Closed by itself: the invoice was cancelled";
  if (input.invoiceStatus === "credited" || input.status === "credited") return "Closed by itself: the invoice was credited in full";
  const parts: [string, number][] = [];
  for (const [word, amount] of [
    ["paid", input.paid],
    ["credited", input.credited],
    ["written off", input.writtenOff],
    ["bank charges", input.bankCharges],
  ] as const) {
    if (money(amount ?? 0) > 0) parts.push([word, money(amount!)]);
  }
  if (parts.length > 1) {
    const list = parts.map(([word, amount]) => `${word} ${amount.toFixed(2)}`).join(", ");
    return `Closed by itself: nothing is left to pay (${list}${input.currency ? ` ${input.currency}` : ""})`;
  }
  if (input.status === "paid") return "Closed by itself: the invoice is paid";
  if (input.status === "written_off") return "Closed by itself: what was left is written off";
  return "Closed by itself: nothing is left to pay";
}

/**
 * Why a dispute that closed by itself is open again: what settled the invoice was taken back, and something is owed
 * again - the dispute it had is not settled, so it stands as it was (with its own reason).
 */
export const DISPUTE_REOPENED_REASON = "Opened again by itself: what settled the invoice was taken back, and something is owed again";

/**
 * Why this note may not be added, or null (D16, D17). Everyone adds a note, a promise, a dispute and its end, and a
 * reminder of level 1 or 2; the final notice (level 3) is for managers. A reminder is a record that one was sent from the
 * user's own mail program. A disputed invoice leaves the reminders until the dispute is closed. A user's promise is at
 * most 60 days ahead (K13); a manager's has no such limit.
 */
export function noteProblem(input: {
  kind: string;
  text: string;
  promisedOn?: string | null;
  reminderLevel?: number | null;
  recipient?: string | null;
  today: string;
  manager: boolean;
  status: ReceivableStatus;
  leftToPay: number;
  disputed: boolean;
}): NoteProblem | null {
  const text = input.text.trim();
  const owed = isOwed({ status: input.status, leftToPay: input.leftToPay });
  switch (input.kind) {
    case "note":
      return text ? null : { kind: "invalid", message: "Write the note" };
    case "promise": {
      const day = (input.promisedOn ?? "").trim();
      if (!day) return { kind: "invalid", message: "Give the day the customer promised to pay by" };
      if (!isRealYmd(day)) return { kind: "invalid", message: "The promised day must be a date (yyyy-mm-dd)" };
      if (day < input.today) return { kind: "invalid", message: "The promised day cannot be before today" };
      if (!input.manager && day > addDays(input.today, PROMISE_MAX_DAYS)) {
        return { kind: "forbidden", message: `A promise is at most ${PROMISE_MAX_DAYS} days ahead: a manager notes a later one` };
      }
      if (!owed) return { kind: "state", message: "Nothing is left to pay on this invoice: no promise is needed" };
      return null;
    }
    case "dispute":
      if (text.length < MIN_REASON) return { kind: "invalid", message: "Say why the customer disputes the invoice" };
      if (input.disputed) return { kind: "state", message: "This invoice is disputed already" };
      if (!owed) return { kind: "state", message: "Nothing is left to pay on this invoice: there is nothing to dispute" };
      return null;
    case "dispute_closed":
      if (text.length < MIN_REASON) return { kind: "invalid", message: "Say how the dispute ended" };
      if (!input.disputed) return { kind: "state", message: "This invoice is not disputed" };
      return null;
    case "reminder": {
      const level = input.reminderLevel;
      if (level !== 1 && level !== 2 && level !== 3) return { kind: "invalid", message: "A reminder is of level 1, 2 or 3 (the final notice)" };
      if (level === 3 && !input.manager) return { kind: "forbidden", message: "Only a manager sends the final notice (reminder 3)" };
      const to = (input.recipient ?? "").trim();
      if (!EMAIL.test(to)) return { kind: "invalid", message: "Give the e-mail the reminder was sent to" };
      if (!owed) return { kind: "state", message: "Nothing is left to pay on this invoice: no reminder is needed" };
      if (input.disputed) return { kind: "state", message: "This invoice is disputed: close the dispute before sending a reminder" };
      return null;
    }
    default:
      return { kind: "invalid", message: "A note is a note, a promise, a dispute, its end or a reminder" };
  }
}

/** A job's invoice as the release check reads it. */
export interface ReleaseRow {
  invoiceId: string;
  number: string;
  customerId: string;
  customer: string;
  currency: string;
  status: ReceivableStatus;
  leftToPay: number;
  daysOverdue: number;
  paymentTerms: string;
}

/**
 * Whether a release (House B/L, Warehouse Released, the Charges gate) warns about payment (D20): the job has an owed
 * invoice that is on prepayment, or whose customer has any overdue invoice. Never a stop.
 */
export function releaseWarning(
  rows: readonly ReleaseRow[],
  overdueByCustomer: ReadonlyMap<string, number>,
): { warn: boolean; customer: string; prepayment: boolean; customerOverdueCount: number; unpaid: { invoiceId: string; number: string; leftToPay: number; currency: string; daysOverdue: number }[] } {
  const owed = rows.filter((r) => isOwed(r));
  const warning = owed.filter((r) => isPrepayment(r.paymentTerms) || (overdueByCustomer.get(r.customerId) ?? 0) > 0);
  const first = warning[0] ?? owed[0];
  return {
    warn: warning.length > 0,
    customer: first?.customer ?? "",
    prepayment: warning.some((r) => isPrepayment(r.paymentTerms)),
    customerOverdueCount: first ? (overdueByCustomer.get(first.customerId) ?? 0) : 0,
    unpaid: owed.map((r) => ({ invoiceId: r.invoiceId, number: r.number, leftToPay: r.leftToPay, currency: r.currency, daysOverdue: r.daysOverdue })),
  };
}

/**
 * The public release check (mock test council n6): the warning, and the stop before any invoice (L3) - the customer on
 * prepayment and selling not yet invoiced, per currency. Then the warning is on and says prepayment, as for an unpaid
 * prepayment invoice, so the dialog tells the stop up front; the server's own check still decides.
 */
export function releaseCheckOf<W extends { warn: boolean; prepayment: boolean }>(
  warning: W,
  uninvoiced: readonly { currency: string; amount: number }[],
): W & { prepaymentUninvoiced: { currency: string; amount: number }[] } {
  const amounts = uninvoiced.filter((a) => money(a.amount) > 0).map((a) => ({ currency: a.currency, amount: money(a.amount) }));
  return amounts.length ? { ...warning, warn: true, prepayment: true, prepaymentUninvoiced: amounts } : { ...warning, prepaymentUninvoiced: [] };
}

/**
 * The day automatic reminders start, as a save of the settings stores it (mock test council P3): none while they are
 * off or e-mail from the app is off (the first run that can really send sets it then: lib/reminderRules
 * switchOnDayToSet); the stored day while they stay on; today when they are switched on with e-mail on.
 */
export function switchOnDayOnSave(
  input: { autoReminders: boolean; emailOn: boolean; before: { autoReminders: boolean; autoRemindersSince: string | null } },
  today: string,
): string | null {
  if (!input.autoReminders || !input.emailOn) return null;
  return input.before.autoReminders && input.before.autoRemindersSince ? input.before.autoRemindersSince : today;
}

/** The highest overdue milestone the bell tells (D18): the first day, then 14 and 30 days; null when not overdue. */
export function overdueMilestone(overdueDays: number): Exclude<ReceivableMilestone, "paid"> | null {
  if (overdueDays >= 30) return "overdue_30";
  if (overdueDays >= 14) return "overdue_14";
  if (overdueDays >= 1) return "overdue_1";
  return null;
}

export const BELL_PAID_DAYS = 7;

/**
 * Whether the bell tells that an invoice was paid (D18): it is paid now, by a payment noted in the last 7 days that
 * settled it, and it was overdue on the day that payment was made. A payment carried over never tells.
 */
export function paidNotice(input: {
  status: ReceivableStatus;
  dueDate: string;
  /** The live payment noted last */
  lastPayment: { kind: string; paidOn: string | null; createdAt: Date } | null;
  now: Date;
}): boolean {
  const p = input.lastPayment;
  if (input.status !== "paid" || !p || p.kind !== "payment" || !p.paidOn) return false;
  if (input.now.getTime() - p.createdAt.getTime() > BELL_PAID_DAYS * 86_400_000) return false;
  return input.dueDate < p.paidOn;
}

export const MILESTONES: readonly ReceivableMilestone[] = ["overdue_1", "overdue_14", "overdue_30", "paid"];

/** A bell key `${invoiceId}:${milestone}` read back; null when it is not one. */
export function parseNoticeKey(key: string): { invoiceId: string; milestone: ReceivableMilestone } | null {
  const at = key.lastIndexOf(":");
  if (at <= 0) return null;
  const invoiceId = key.slice(0, at);
  const milestone = key.slice(at + 1) as ReceivableMilestone;
  if (!isUuid(invoiceId) || !MILESTONES.includes(milestone)) return null;
  return { invoiceId, milestone };
}

/** A row as the By customer tab adds it up. */
export interface AgingRowInput {
  customerId: string;
  customer: string;
  currency: string;
  status: ReceivableStatus;
  leftToPay: number;
  agingBucket: AgingBucket | null;
  dueDate: string;
}

export interface AgingTotals {
  customerId: string;
  customer: string;
  currency: string;
  unpaid: number;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
  oldestDue: string | null;
  invoices: number;
}

const BUCKET_FIELD: Record<AgingBucket, keyof Pick<AgingTotals, "current" | "d1to30" | "d31to60" | "d61to90" | "d90plus">> = {
  current: "current",
  "1-30": "d1to30",
  "31-60": "d31to60",
  "61-90": "d61to90",
  "90+": "d90plus",
};

/** What each customer owes per currency, by age (D7): only invoices still owed; one row per customer and currency. */
export function agingByCustomer(rows: readonly AgingRowInput[]): AgingTotals[] {
  const out = new Map<string, AgingTotals>();
  for (const r of rows) {
    if (!isOwed(r) || !r.agingBucket) continue;
    const key = `${r.customerId}|${r.currency}`;
    const row = out.get(key) ?? { customerId: r.customerId, customer: r.customer, currency: r.currency, unpaid: 0, current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0, oldestDue: null, invoices: 0 };
    row.unpaid = round2(row.unpaid + r.leftToPay);
    const field = BUCKET_FIELD[r.agingBucket];
    row[field] = round2(row[field] + r.leftToPay);
    if (!row.oldestDue || r.dueDate < row.oldestDue) row.oldestDue = r.dueDate;
    row.invoices += 1;
    out.set(key, row);
  }
  return [...out.values()].sort((a, b) => a.customer.localeCompare(b.customer) || a.customerId.localeCompare(b.customerId) || a.currency.localeCompare(b.currency));
}

// ── The prepayment stop (D20's later yes, step 7) ──

/**
 * The prepayment stop: the job has an invoice on prepayment with something left to pay (unpaid or part paid). Then the
 * House B/L release and Warehouse Released are refused for a user; a manager may release with a reason. The overdue
 * warning stays a warning only.
 */
export const prepaymentUnpaidOf = (rows: readonly Pick<ReleaseRow, "status" | "leftToPay" | "paymentTerms">[]): boolean =>
  rows.some((r) => isOwed(r) && isPrepayment(r.paymentTerms));

/**
 * The prepayment stop before any invoice (mock test council L3): the job's customer is on prepayment and the job has
 * selling with a value not yet invoiced (unbilledOf of the job's lines) - the amounts per currency that are above 0;
 * none when the customer is not on prepayment. Then the release waits as for an unpaid prepayment invoice.
 */
export const prepaymentUninvoicedOf = (paymentTerms: string | null | undefined, unbilled: readonly { currency: string; amount: number }[]): { currency: string; amount: number }[] =>
  isPrepayment(paymentTerms) ? unbilled.filter((a) => a.amount > 0).map((a) => ({ currency: a.currency, amount: money(a.amount) })) : [];

/** The invoices the prepayment stop is about: the owed ones on prepayment (not the job's other owed invoices). */
export const prepaymentInvoicesOf = (rows: readonly ReleaseRow[]): { invoiceId: string; number: string; leftToPay: number; currency: string }[] =>
  rows.filter((r) => isOwed(r) && isPrepayment(r.paymentTerms)).map((r) => ({ invoiceId: r.invoiceId, number: r.number, leftToPay: r.leftToPay, currency: r.currency }));

// ── Month-end as at a day (step 7) ──

/** A line of an invoice as the month-end list reads it. */
export interface AsAtLine {
  kind: ReceivableLineKind | string;
  amount: number | string;
  paidOn: string | null;
  confirmedAt: Date | string | null;
  takenBackAt: Date | string | null;
  /** How it was taken back (P8): none for a live line or one taken back before migration 0039 (a mistake) */
  takenBackKind?: string | null;
  /** A reversed payment: the day it went back */
  reversedOn?: string | null;
}

/**
 * Whether a line counted at the end of `day`: a payment paid on or before it; one carried over from the customer's list
 * (its day not known: it counts, flagged); a write-off or bank charge confirmed on or before it (the Prague day of the
 * confirmation). A line taken back as noted by mistake never counts on any day (mock test council N2, decision L1): it
 * is most often a payment on the wrong invoice, then noted on the right one with the same paid day - so counting it on
 * the days before its take-back would count the one payment twice and understate the receivables. A payment taken back
 * as reversed (P8: a bank return, a refund) was paid all the same: it counts from its day up to the day before it went
 * back.
 */
export function countsAt(line: AsAtLine, day: string): boolean {
  if (line.takenBackAt) {
    if (line.takenBackKind !== "reversed" || !line.reversedOn || !isMoneyKind(line.kind) || day >= line.reversedOn) return false;
    return line.kind === "carried_over" || (!!line.paidOn && line.paidOn <= day);
  }
  if (line.kind === "carried_over") return true;
  if (isWriteOffKind(line.kind)) return !!line.confirmedAt && businessDay(new Date(line.confirmedAt)) <= day;
  return !!line.paidOn && line.paidOn <= day;
}

export interface AsAtInput {
  invoiceStatus: string;
  issueDate: string;
  dueDate: string;
  gross: number;
  /** CZK per 1 unit (the invoice's own ČNB rate) */
  fxRate: number;
  creditNotes: readonly { issueDate: string; gross: number | string }[];
  lines: readonly AsAtLine[];
}

export interface AsAtState {
  credited: number;
  paid: number;
  writtenOff: number;
  leftToPay: number;
  leftToPayCzk: number;
  daysOverdue: number;
  agingBucket: AgingBucket | null;
  carriedOver: boolean;
  /** Listed: issued on or before the day, not cancelled, something left to pay at its end */
  listed: boolean;
}

/**
 * An invoice as it stood at the end of `day` (month-end receivables): credited by credit notes issued on or before
 * it, less what counted on it (countsAt); in CZK at the invoice's own rate. A cancelled invoice and one issued after
 * the day are never listed.
 */
export function asAtOf(input: AsAtInput, day: string): AsAtState {
  const credited = creditedOf(input.creditNotes.filter((c) => c.issueDate <= day).map((c) => c.gross));
  const counted = input.lines.filter((l) => countsAt(l, day));
  const paid = sumOf(counted.filter((l) => !isWriteOffKind(l.kind)));
  const writtenOff = sumOf(counted.filter((l) => isWriteOffKind(l.kind)));
  const leftToPay = money(input.gross - credited - paid - writtenOff);
  const listed = input.invoiceStatus !== "cancelled" && input.issueDate <= day && leftToPay > 0;
  const days = listed && input.dueDate < day ? daysOverdue(input.dueDate, day) : 0;
  return {
    credited,
    paid,
    writtenOff,
    leftToPay,
    leftToPayCzk: money(leftToPay * input.fxRate),
    daysOverdue: days,
    agingBucket: listed ? agingBucketOf(leftToPay, days) : null,
    carriedOver: counted.some((l) => l.kind === "carried_over"),
    listed,
  };
}

/** The words the month-end page shows beside its one CZK total. */
export const AS_AT_CZK_RATE = "at each invoice's own ČNB rate";

/** Why the month-end day is refused, or null: a real date, not after today. */
export function asAtDayProblem(day: string, today: string): string | null {
  if (!isRealYmd(day)) return "The day must be a date (yyyy-mm-dd)";
  if (day > today) return "The day cannot be after today";
  return null;
}

// ── Work not yet invoiced (step 7) ──

/**
 * What is done on a customer's open jobs and not invoiced yet, beside the credit limit (never added to "used"): per
 * currency, the selling lines with a value that are not on an issued, not credited invoice (lib/billingQueue's notion
 * of an invoiced line: one an open invoice or its partial credit note was made from). Net, as priced, never converted.
 */
export function unbilledOf(
  rows: readonly { id: string; shipmentId: string; qty: string | number | null; amount: string | number | null; currency: string }[],
  openInvoices: readonly { sourceSellingCostIds: readonly (string | null)[] }[],
): { amounts: { currency: string; amount: number }[]; jobs: number } {
  const invoiced = new Set(openInvoices.flatMap((i) => i.sourceSellingCostIds).filter((x): x is string => !!x));
  const lines: { amount: number; currency: string }[] = [];
  const jobs = new Set<string>();
  for (const r of rows) {
    if (invoiced.has(r.id)) continue;
    // DELIBERATE - do not "fix": every selling line with a value counts, ticked for Invoice or not. The owner decided on
    // 17 Nov 2026 that a job is Invoiced only once EVERY selling line with a value, ticked or not, is on an invoice
    // (commit f57ba992), so an unticked line is work not yet invoiced too.
    const value = money(Number(r.amount ?? 0) * qtyOrOne(r.qty));
    if (!value) continue;
    lines.push({ amount: value, currency: r.currency || "CZK" });
    jobs.add(r.shipmentId);
  }
  return { amounts: sumByCurrency(lines).filter((a) => a.amount !== 0), jobs: jobs.size };
}

// ── Reminder settings (step 7) ──

export const REMINDER_DAYS_MAX = 365;

/** Why these reminder settings are refused, or null: reminder 1 at 1–365 days, reminder 2 later, at most 365; a reply-to e-mail or none. */
export function settingsProblem(input: { reminder1Days: number; reminder2Days: number; replyTo: string }): string | null {
  const { reminder1Days: one, reminder2Days: two } = input;
  if (!Number.isInteger(one) || one < 1 || one > REMINDER_DAYS_MAX) return `Reminder 1 is sent 1 to ${REMINDER_DAYS_MAX} days after the due day`;
  if (!Number.isInteger(two) || two <= one || two > REMINDER_DAYS_MAX) return `Reminder 2 is sent after reminder 1, at most ${REMINDER_DAYS_MAX} days after the due day`;
  const to = input.replyTo.trim();
  if (to && !EMAIL.test(to)) return "The reply-to address must be an e-mail (or left empty)";
  return null;
}
