import { APIError } from "encore.dev/api";
import { isRealYmd } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { accountListed, normaliseBankAccount } from "./bankAccount";
import { splitCents } from "./costSplit";
import { formatDay } from "./format";
import type { HaulierProfile } from "../interfaces/interfaces";
import type { HaulierInvoiceInput, HaulierInvoiceLineInput, HaulierInvoiceStatus } from "../interfaces/haulierInvoice.interfaces";

// Haulier invoice rules (owner decisions, Phase 6): EXACT match only - any difference from what we
// expect to pay needs a manager's approval with a reason; and payment is never approved while
// the haulier is an unreliable VAT payer, its account is not published in the VAT register, the
// invoice's account is not one of its published accounts, or the haulier is blocked (Czech VAT
// joint liability, ručení za DPH) - a hard block nobody can override. Pure.

export const MAX_INVOICE_LINES = 200;
export const MAX_REASON = 500;

const bad = (message: string) => APIError.invalidArgument(message);

/** Amount → whole cents. */
export const cents = (n: number): number => Math.round(n * 100);
const fromCents = (c: number): number => c / 100;

/** The invoice number as compared for duplicates: capitals, no spaces. */
export const invoiceNumberKey = (n: string): string => n.replace(/\s+/g, "").toUpperCase();

/** The profile parts the VAT check reads (null = the haulier has no trucking profile). */
export type VatProfile = Pick<HaulierProfile, "vatUnreliable" | "bankAccountPublished" | "bankAccounts" | "blocked" | "blockReason" | "vatCheckedAt">;

/** Why payment of an invoice to this haulier into `bankAccount` may not be approved; empty = it may. */
export function invoiceBlockReasons(p: VatProfile | null, bankAccount: string): string[] {
  if (!p) return ["The haulier has no trucking profile: its VAT register check is not on file"];
  const out: string[] = [];
  if (p.vatUnreliable) out.push("The haulier is listed as an unreliable VAT payer (nespolehlivý plátce DPH): paying it would make us liable for its VAT");
  if (!p.bankAccountPublished) out.push("The haulier's bank account is not marked as published in the VAT register");
  if (!accountListed(bankAccount, p.bankAccounts ?? [])) {
    out.push(`Bank account ${bankAccount} is not one of the haulier's accounts published in the VAT register`);
  }
  if (p.blocked) out.push(p.blockReason ? `The haulier is blocked: ${p.blockReason}` : "The haulier is blocked");
  return out;
}

/** The invoice's account against the haulier's published accounts (the manual list for now). */
export function bankAccountCheck(p: VatProfile | null, bankAccount: string): { published: boolean | null; checkedAt: string | null; note: string } {
  if (!p) return { published: null, checkedAt: null, note: "The haulier has no trucking profile" };
  const published = accountListed(bankAccount, p.bankAccounts ?? []);
  const when = p.vatCheckedAt ? `VAT register last checked on ${formatDay(p.vatCheckedAt)}` : "The VAT register has never been checked";
  return {
    published,
    checkedAt: p.vatCheckedAt,
    note: published ? `Published in the VAT register. ${when}.` : `Not among the haulier's published accounts. ${when}.`,
  };
}

/** One line's numbers as matched (cents kept exact). */
export interface MatchLine {
  expected: number;
  invoiced: number;
}

export interface MatchResult {
  status: HaulierInvoiceStatus;
  /** Per line: invoiced − expected */
  lineDifferences: number[];
  /** totalNet − Σ expected */
  difference: number;
  /** Why it is not an exact match (plain English); empty on an exact match */
  mismatches: string[];
}

/**
 * The status an invoice gets: BLOCKED while there is a block reason; DRAFT without lines; else
 * APPROVED when every line and the net total match to the cent (an exact match is approved
 * automatically), NEEDS_APPROVAL on any difference.
 */
export function matchInvoice(totalNet: number, lines: MatchLine[], blockReasons: string[]): MatchResult {
  const lineDifferences = lines.map((l) => fromCents(cents(l.invoiced) - cents(l.expected)));
  const expected = lines.reduce((a, l) => a + cents(l.expected), 0);
  const invoiced = lines.reduce((a, l) => a + cents(l.invoiced), 0);
  const difference = fromCents(cents(totalNet) - expected);
  const mismatches: string[] = [];
  lineDifferences.forEach((d, i) => {
    if (d !== 0) mismatches.push(`Line ${i + 1}: invoiced ${d > 0 ? "more" : "less"} than expected by ${Math.abs(d).toFixed(2)}`);
  });
  if (cents(totalNet) !== invoiced) mismatches.push(`The net total ${totalNet.toFixed(2)} is not the sum of the lines ${fromCents(invoiced).toFixed(2)}`);
  let status: HaulierInvoiceStatus;
  if (blockReasons.length) status = "BLOCKED";
  else if (!lines.length) status = "DRAFT";
  else status = mismatches.length ? "NEEDS_APPROVAL" : "APPROVED";
  return { status, lineDifferences, difference, mismatches };
}

/** The statuses an invoice is still open in (changed, approved or rejected from). */
export const OPEN_STATUSES: HaulierInvoiceStatus[] = ["DRAFT", "NEEDS_APPROVAL", "BLOCKED"];

/**
 * An open invoice's status as it is now, with the haulier's block reasons worked out again
 * (its VAT profile may have been fixed - or broken - since the save). An exact match that is no
 * longer blocked waits for a manager's approval: reading an invoice never approves it.
 */
export function currentStatus(stored: HaulierInvoiceStatus, totalNet: number, lines: MatchLine[], blockReasons: string[]): HaulierInvoiceStatus {
  if (!OPEN_STATUSES.includes(stored)) return stored;
  const { status } = matchInvoice(totalNet, lines, blockReasons);
  return status === "APPROVED" ? "NEEDS_APPROVAL" : status;
}

/**
 * `amount` split like `weights` (the estimate's split), exact to the cent, largest remainder.
 * When the weights cannot split it (none above 0, or a negative one), it all goes to the first part.
 */
export function splitLike(amount: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const total = cents(amount);
  if (weights.some((w) => !Number.isFinite(w) || w < 0) || !weights.some((w) => w > 0)) {
    return weights.map((_, i) => (i === 0 ? fromCents(total) : 0));
  }
  return splitCents(total, weights).map(fromCents);
}

// ---- input --------------------------------------------------------------------------------------

const day = (v: unknown, what: string, required: boolean): string | null => {
  if (v === null || v === undefined || v === "") {
    if (required) throw bad(`${what} is required`);
    return null;
  }
  if (typeof v !== "string" || !isRealYmd(v)) throw bad(`${what} must be a date like 2026-10-15`);
  return v;
};

const money = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) >= 1e12) throw bad(`${what} must be a number`);
  return fromCents(cents(v));
};

export interface CleanInvoice {
  invoiceNumber: string;
  invoiceNumberKey: string;
  issueDate: string;
  dueDate: string | null;
  duzp: string | null;
  currency: "CZK" | "EUR";
  totalNet: number;
  vatAmount: number;
  totalGross: number;
  bankAccount: string;
  lines: HaulierInvoiceLineInput[];
}

/** An invoice as saved (header and lines); throws invalid_argument saying what is wrong. */
export function cleanInvoiceInput(input: Omit<HaulierInvoiceInput, "haulierCustomerId" | "fileName" | "fileBase64">): CleanInvoice {
  const invoiceNumber = typeof input.invoiceNumber === "string" ? input.invoiceNumber.trim() : "";
  if (!invoiceNumber) throw bad("The invoice number is required");
  if (invoiceNumber.length > 50) throw bad("The invoice number can be at most 50 characters long");
  if (input.currency !== "CZK" && input.currency !== "EUR") throw bad("The currency must be CZK or EUR");
  const issueDate = day(input.issueDate, "The issue date", true)!;
  const dueDate = day(input.dueDate, "The due date", false);
  if (dueDate && dueDate < issueDate) throw bad("The due date cannot be before the issue date");
  const duzp = day(input.duzp, "The DUZP (date of taxable supply)", false);
  const bankAccount = normaliseBankAccount(input.bankAccount);
  if (!bankAccount) throw bad("The bank account must be a valid Czech account (prefix-number/bank) or an IBAN");
  const raw = Array.isArray(input.lines) ? input.lines : [];
  if (raw.length > MAX_INVOICE_LINES) throw bad(`At most ${MAX_INVOICE_LINES} lines are allowed`);
  const lines = raw.map((l, i): HaulierInvoiceLineInput => {
    const n = i + 1;
    if (l?.targetKind !== "TRIP" && l?.targetKind !== "PARTNER_LEG") throw bad(`Line ${n}: the target must be a TRIP or a PARTNER_LEG`);
    if (typeof l.targetId !== "string" || !isUuid(l.targetId)) throw bad(`Line ${n}: unknown trip or delivery`);
    const note = typeof l.note === "string" ? l.note.trim() : "";
    if (note.length > 500) throw bad(`Line ${n}: the note can be at most 500 characters long`);
    return { targetKind: l.targetKind, targetId: l.targetId.toLowerCase(), invoiced: money(l.invoiced, `Line ${n}: the invoiced amount`), note };
  });
  const keys = lines.map((l) => `${l.targetKind}:${l.targetId}`);
  if (new Set(keys).size !== keys.length) throw bad("A trip or delivery is listed twice");
  return {
    invoiceNumber,
    invoiceNumberKey: invoiceNumberKey(invoiceNumber),
    issueDate,
    dueDate,
    duzp,
    currency: input.currency,
    totalNet: money(input.totalNet, "The net total"),
    vatAmount: money(input.vatAmount, "The VAT amount"),
    totalGross: money(input.totalGross, "The gross total"),
    bankAccount,
    lines,
  };
}

/** A manager's reason (approve / reject): 3 to 500 characters. */
export function cleanReason(v: unknown, what: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < 3 || s.length > MAX_REASON) throw bad(`Give a reason for the ${what} (3 to ${MAX_REASON} characters)`);
  return s;
}
