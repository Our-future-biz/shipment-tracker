import type { PillTone } from "@/components/Pill";
import { formatDate } from "@/lib/date";
import { parseMoney, round2 } from "@/lib/money";

// Finance → Accounts Receivable → Bank statements (step 7): the pure rules of the page. A statement's incoming entries
// wait for a manager, who puts each on one or several invoices and confirms it; the server checks everything again
// (api lib/bankMatch allocationProblem) and these rules only say it sooner, in the same words. Nothing is ever
// confirmed without that click.

/** At most this many invoices in one payment (the server's MAX_ALLOCATIONS). */
export const MAX_ALLOCATIONS = 100;
/** A reason to set an entry aside: at least this many characters (the server's MIN_REASON). */
export const MIN_REASON = 3;
/** The largest file the server reads. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type EntryStatus = "proposed" | "no_match" | "confirmed" | "ignored" | "not_incoming";

/** What an entry needs for its label. */
export interface EntryFacts {
  status: EntryStatus;
  credit: boolean;
}

/** The entry's state in words. Money out (and a reversal) is never a customer's payment. */
export function entryStatusLabel(e: EntryFacts): string {
  if (e.status === "not_incoming") return e.credit ? "Not a customer payment (a reversal)" : "Money out (not a customer payment)";
  if (e.status === "proposed") return "To confirm";
  if (e.status === "no_match") return "No invoice found";
  if (e.status === "confirmed") return "Confirmed";
  return "Set aside";
}

export function entryStatusTone(e: EntryFacts): PillTone {
  if (e.status === "proposed") return "indigo";
  if (e.status === "no_match") return "amber";
  if (e.status === "confirmed") return "green";
  return "slate";
}

/** Still waiting for a manager (an incoming entry that is neither confirmed nor set aside). */
export const isOpenEntry = (e: EntryFacts): boolean => e.credit && (e.status === "proposed" || e.status === "no_match");

export type EntryTab = "decide" | "confirmed" | "ignored" | "out" | "all";

export const ENTRY_TABS: { key: EntryTab; label: string; dividerBefore?: boolean }[] = [
  { key: "decide", label: "To decide" },
  { key: "confirmed", label: "Confirmed" },
  { key: "ignored", label: "Set aside" },
  { key: "out", label: "Money out" },
  { key: "all", label: "All", dividerBefore: true },
];

/** Whether an entry is listed under a tab. */
export function inEntryTab(e: EntryFacts, tab: EntryTab): boolean {
  if (tab === "all") return true;
  if (tab === "decide") return isOpenEntry(e);
  if (tab === "confirmed") return e.status === "confirmed";
  if (tab === "ignored") return e.status === "ignored";
  return e.status === "not_incoming" || !e.credit;
}

/** The tab a statement opens on: To decide while something waits, else All. */
export const firstEntryTab = (entries: readonly EntryFacts[]): EntryTab => (entries.some(isOpenEntry) ? "decide" : "all");

/** "01.11.2026 – 30.11.2026"; one day once; "—" for none. */
export function periodText(from: string | null, to: string | null): string {
  if (!from && !to) return "—";
  if (!from || !to || from === to) return formatDate(from ?? to);
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** One invoice the manager puts (part of) the entry on, as the form holds it. */
export interface AllocationRow {
  invoiceId: string;
  number: string;
  customer: string;
  currency: string;
  leftToPay: number;
  /** The receivable's version the manager saw: sent back on confirm */
  version: number;
  /** The amount as typed */
  amountText: string;
}

/** A candidate or an owed invoice, as the form takes it. */
export interface InvoiceChoice {
  invoiceId: string;
  number: string;
  customer: string;
  currency: string;
  leftToPay: number;
  version: number;
}

const cents = (n: number) => Math.round(n * 100);

/** The amount a newly chosen invoice starts with: what is left of the entry, at most what is left to pay on it. */
export function startAmount(entryAmount: number, alreadyAllocated: number, leftToPay: number): string {
  const rest = Math.max(0, cents(entryAmount) - cents(alreadyAllocated));
  const amount = Math.min(rest, cents(leftToPay));
  return amount > 0 ? (amount / 100).toFixed(2) : "";
}

/** The form's first row: the best candidate (the server orders them), with min(entry amount, its left to pay). None without one. */
export function prefillAllocations(entry: { amount: number }, candidates: readonly InvoiceChoice[]): AllocationRow[] {
  const best = candidates[0];
  if (!best) return [];
  return [{ ...best, amountText: startAmount(entry.amount, 0, best.leftToPay) }];
}

/** The form with one more invoice (none when it is chosen already), starting with what is left of the entry. */
export function addAllocation(rows: readonly AllocationRow[], entry: { amount: number }, choice: InvoiceChoice): AllocationRow[] {
  if (rows.some((r) => r.invoiceId === choice.invoiceId)) return [...rows];
  const allocated = rows.reduce((sum, r) => sum + (parseMoney(r.amountText) ?? 0), 0);
  return [...rows, { ...choice, amountText: startAmount(entry.amount, allocated, choice.leftToPay) }];
}

/**
 * The form's rows with each invoice as it is now (its left to pay and version from the last read), so what the
 * manager checks against and what confirm sends are the same and current. An invoice no longer found keeps what was
 * seen: the server then says it is not owed any more.
 */
export function withFreshFacts(rows: readonly AllocationRow[], fresh: ReadonlyMap<string, InvoiceChoice>): AllocationRow[] {
  return rows.map((r) => {
    const now = fresh.get(r.invoiceId);
    return now ? { ...r, ...now, amountText: r.amountText } : r;
  });
}

export interface AllocationCheck {
  /** Why it cannot be confirmed as it is ("" when it can) */
  problem: string;
  /** The amounts together, in the entry's currency */
  total: number;
  /** What of the entry is put on no invoice (an overpayment, money for something else); below 0 when too much */
  rest: number;
  /** What confirm sends, when there is no problem */
  items: { invoiceId: string; receivableVersion: number; amount: number }[];
}

/**
 * Whether the form can be confirmed: at least one invoice, each once, each amount above 0 with at most 2 decimals, in
 * the entry's currency and at most what is left to pay on it, and together at most the entry. The words are the
 * server's.
 */
export function checkAllocations(entry: { amount: number; currency: string }, rows: readonly AllocationRow[]): AllocationCheck {
  let totalCents = 0;
  let problem = "";
  const ids = new Set<string>();
  const items: AllocationCheck["items"] = [];
  const fail = (p: string) => {
    if (!problem) problem = p;
  };
  if (!rows.length) fail("Choose at least one invoice this payment pays");
  if (rows.length > MAX_ALLOCATIONS) fail(`At most ${MAX_ALLOCATIONS} invoices in one payment`);
  for (const r of rows) {
    if (ids.has(r.invoiceId)) fail("An invoice is chosen twice: give it one amount");
    ids.add(r.invoiceId);
    const label = r.number || "An invoice";
    if (!r.amountText.trim()) {
      fail(`Give the amount paid on ${label}`);
      continue;
    }
    const amount = parseMoney(r.amountText);
    if (amount === null) {
      fail(`The amount on ${label} must be a number with at most 2 decimals`);
      continue;
    }
    if (amount <= 0) fail("Each amount must be above 0");
    if (r.currency !== entry.currency) fail(`${label} is in ${r.currency}, the payment in ${entry.currency}`);
    if (cents(amount) > cents(r.leftToPay)) fail(`More than is left to pay on ${label} (${round2(r.leftToPay).toFixed(2)} ${r.currency})`);
    totalCents += cents(amount);
    items.push({ invoiceId: r.invoiceId, receivableVersion: r.version, amount: round2(amount) });
  }
  if (totalCents > cents(entry.amount)) fail(`Together more than the payment (${round2(entry.amount).toFixed(2)} ${entry.currency})`);
  const total = totalCents / 100;
  const rest = (cents(entry.amount) - totalCents) / 100;
  return { problem, total, rest, items: problem ? [] : items };
}

/** Setting an entry aside needs a reason (the server's words). */
export const ignoreProblem = (reason: string): string => (reason.trim().length < MIN_REASON ? "Say why this entry is set aside" : "");

/** Why a chosen file is not sent ("" when it is): a CAMT.053 statement is an .xml file of at most 10 MB. */
export function fileProblem(file: { name: string; size: number }): string {
  if (!/\.xml$/i.test(file.name)) return "Choose the bank's CAMT.053 statement: an .xml file";
  if (file.size === 0) return "The file is empty";
  if (file.size > MAX_FILE_BYTES) return "The file is larger than 10 MB";
  return "";
}

/** The counts of a statement in words: "3 to decide · 5 confirmed · 1 set aside · 4 money out (not customer payments)". */
export function countsText(c: { toDecide: number; confirmed: number; ignored: number; notIncoming: number; seenBefore: number }): string {
  const parts = [
    c.toDecide ? `${c.toDecide} to decide` : "",
    c.confirmed ? `${c.confirmed} confirmed` : "",
    c.ignored ? `${c.ignored} set aside` : "",
    c.notIncoming ? `${c.notIncoming} money out (not customer payments)` : "",
    c.seenBefore ? `${c.seenBefore} read before from another file` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No entries";
}
