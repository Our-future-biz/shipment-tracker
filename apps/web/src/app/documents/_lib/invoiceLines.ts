import { num } from "@/lib/money";
import type { MasterInvoiceRow, SplitMethod } from "./masterInvoice";
import { splitLines } from "./masterInvoice";

// An invoice read line by line. A line whose B/L is a shipment's House B/L goes to that shipment.
// Any other is shared out over the ticked shipments by W/M or per shipment, unless a person chooses
// a shipment for it: the split is only for what can't be identified. Pure, so the sorting has its test.

/** A line that goes to the split instead of to one shipment. */
export const SPLIT_TARGET = "split";

export interface InvoiceLineDraft {
  bl: string;
  item: string;
  amount: string;
  currency: string;
  /** the charge code it is posted under; empty until one is chosen */
  category: string;
  /** chosen by a person: a shipment, or SPLIT_TARGET; absent = as its B/L says */
  target?: string;
}

export interface BlShipment {
  shipmentId: string;
  jobNumber: string;
  houseBol: string;
  /** Cancelled Shipment: nothing is posted to it, so its B/L places no line */
  cancelled?: boolean;
}

export type LineMatch =
  /** its B/L is this shipment's House B/L */
  | { kind: "bl"; shipmentId: string }
  /** its B/L is the master job's: it belongs to all of them */
  | { kind: "master" }
  /** it names no B/L */
  | { kind: "no-bl" }
  /** no shipment of the master job has its B/L */
  | { kind: "not-found" }
  /** more than one shipment has its B/L */
  | { kind: "ambiguous"; jobNumbers: string[] }
  /** only a cancelled shipment has its B/L */
  | { kind: "cancelled"; jobNumber: string };

/** A B/L as compared: capitals, without spaces or punctuation. */
export const blKey = (bl: string | null | undefined): string => (bl ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// A shipment's field may hold more than one number ("A1, B2"); a space may sit inside one ("GLSL 2606").
const blKeysOf = (field: string): string[] => field.split(/[,;]+/).map(blKey).filter(Boolean);

/** Whether the invoice names a B/L on any line: only then is it sorted by them. */
export const namesBls = (lines: readonly InvoiceLineDraft[]): boolean => lines.some((l) => blKey(l.bl));

/**
 * What a line's B/L says about where it belongs, among the shipments of the chosen master job. A
 * cancelled shipment takes nothing: its B/L only says so, and the line goes to the split.
 */
export function matchLine(line: Pick<InvoiceLineDraft, "bl">, shipments: readonly BlShipment[], masterBols: readonly string[] = []): LineMatch {
  const key = blKey(line.bl);
  if (!key) return { kind: "no-bl" };
  const found = shipments.filter((s) => blKeysOf(s.houseBol).includes(key));
  const live = found.filter((s) => !s.cancelled);
  if (live.length === 1) return { kind: "bl", shipmentId: live[0]!.shipmentId };
  if (live.length > 1) return { kind: "ambiguous", jobNumbers: live.map((s) => s.jobNumber) };
  if (found.length > 0) return { kind: "cancelled", jobNumber: found[0]!.jobNumber };
  return masterBols.flatMap(blKeysOf).includes(key) ? { kind: "master" } : { kind: "not-found" };
}

/** Where a line goes: where a person sent it, else the shipment its B/L names, else the split. */
export const lineTarget = (line: InvoiceLineDraft, match: LineMatch): string => line.target ?? (match.kind === "bl" ? match.shipmentId : SPLIT_TARGET);

/** Whether a line asks to be looked at: its shipment couldn't be identified and nobody chose one. */
export const lineFlagged = (line: InvoiceLineDraft, match: LineMatch): boolean => !line.target && match.kind !== "bl" && match.kind !== "master";

/** What the screen says about a line that goes to the split by itself. */
export function matchNote(match: LineMatch): string | null {
  if (match.kind === "master") return "Master B/L: shared by all its shipments";
  if (match.kind === "no-bl") return "No B/L on this line: goes to the split unless you choose";
  if (match.kind === "not-found") return "This B/L is on no shipment of the master job: goes to the split unless you choose";
  if (match.kind === "ambiguous") return `${match.jobNumbers.join(", ")} have this B/L: goes to the split unless you choose`;
  if (match.kind === "cancelled") return `This B/L is ${match.jobNumber}'s, which is cancelled: goes to the split unless you choose`;
  return null;
}

/**
 * A line's amount as typed or read ("1,177.20", "1 177,20", "-45"), or null when it is no amount: anything
 * but digits, separators and a minus in front, or 0. Read as the money fields read it (money.ts num).
 */
export function lineAmount(text: string | undefined): number | null {
  const t = (text ?? "").trim();
  if (!/^-?[\d\s\u00a0\u202f.,]+$/.test(t)) return null;
  const n = Math.round(num(t) * 100) / 100;
  return Number.isFinite(n) && n !== 0 ? n : null;
}

const centsOf = (l: InvoiceLineDraft) => Math.round((lineAmount(l.amount) ?? 0) * 100);

/** The sum of the lines in cents, per currency. */
export function linesTotals(lines: readonly InvoiceLineDraft[], fallbackCurrency: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const l of lines) {
    const currency = l.currency || fallbackCurrency;
    totals.set(currency, (totals.get(currency) ?? 0) + centsOf(l));
  }
  return totals;
}

/**
 * On a credit note, the lines that would add buying: the server refuses any row above 0. A line printed
 * plus is fine while the lines going the same way under its charge and currency come to a deduction
 * (a charge among the credits); otherwise it is marked, and nothing is posted until it is corrected.
 */
export function creditLinesAbove0(lines: readonly InvoiceLineDraft[], matches: readonly LineMatch[], fallbackCurrency: string): Set<number> {
  const keyOf = (l: InvoiceLineDraft, i: number) => `${lineTarget(l, matches[i]!)} ${l.category} ${l.currency || fallbackCurrency}`;
  const sums = new Map<string, number>();
  lines.forEach((l, i) => sums.set(keyOf(l, i), (sums.get(keyOf(l, i)) ?? 0) + centsOf(l)));
  return new Set(lines.flatMap((l, i) => (centsOf(l) > 0 && sums.get(keyOf(l, i))! > 0 ? [i] : [])));
}

/** Whether a line stops the invoice from being posted: an amount that is none, or a credit note's line adding buying. */
export function invoiceLinesInvalid(lines: readonly InvoiceLineDraft[], matches: readonly LineMatch[], currency: string, creditNote: boolean): boolean {
  return lines.some((l) => lineAmount(l.amount) === null) || (creditNote && creditLinesAbove0(lines, matches, currency).size > 0);
}

/**
 * The lines as the server posts them, or null while something is missing: a charge or an amount on
 * any line, or, when a line goes to the split, how to split and somebody to split it over.
 */
export function invoicePostLines(
  lines: readonly InvoiceLineDraft[],
  matches: readonly LineMatch[],
  rows: readonly MasterInvoiceRow[],
  ticked: ReadonlySet<string>,
  method: SplitMethod | null,
  fallbackCurrency: string,
) {
  if (!lines.length || lines.some((l) => !l.category || lineAmount(l.amount) === null)) return null;
  const toSplit = lines.some((l, i) => lineTarget(l, matches[i]!) === SPLIT_TARGET);
  if (toSplit && !method) return null;
  const split = toSplit ? splitLines([...rows], ticked, method!) : [];
  if (toSplit && !split.some((s) => s.weight > 0)) return null;
  return lines.map((l, i) => {
    const target = lineTarget(l, matches[i]!);
    // The B/L goes along: the server checks a line placed by it against its shipment's House B/L, and
    // one a person sent elsewhere only against the master job.
    const base = { category: l.category, amount: lineAmount(l.amount)!.toFixed(2), currency: l.currency || fallbackCurrency, item: l.item.slice(0, 300), bl: l.bl || undefined };
    return target === SPLIT_TARGET ? { ...base, split } : { ...base, shipmentId: target, chosen: l.target !== undefined };
  });
}

/** Whether anything goes to the split, so how to split must be asked. */
export const anyToSplit = (lines: readonly InvoiceLineDraft[], matches: readonly LineMatch[]): boolean =>
  lines.some((l, i) => lineTarget(l, matches[i]!) === SPLIT_TARGET);

/** A credit note's total as it is posted: minus, however it is printed; left as it is when it is no number. */
export function creditAmount(amount: string | undefined): string {
  if (!amount?.trim()) return "";
  const n = lineAmount(amount);
  return n === null ? amount : (-Math.abs(n)).toFixed(2);
}

/**
 * A credit note's lines as they are posted, adding up to a deduction. Documents print them plus or
 * minus: lines that come to more than 0 are turned round, and a charge among credits stays one.
 */
export function creditLines(lines: readonly InvoiceLineDraft[]): InvoiceLineDraft[] {
  const cents = lines.reduce((sum, l) => sum + centsOf(l), 0);
  if (cents <= 0) return [...lines];
  return lines.map((l) => {
    const amount = lineAmount(l.amount);
    return amount === null ? l : { ...l, amount: (-amount).toFixed(2) };
  });
}
