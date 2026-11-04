// A supplier's open buying cost lines, as "What we owe" on its page shows them (Council Outlay 7,
// step 6b, and Council Review 5):
//  - owed: received and not paid, its real cost; due its received day (Prague) + the supplier's payment
//    days, overdue once that day is past
//  - expected: not received yet (the real cost once typed, else the estimate); never in the owed total (E9)
//  - untracked: ticked Received before that day was kept, before payments were noted here, so it may have
//    been paid already: listed apart, not counted (K2)
// Lines whose vendor only names the supplier as typed text are not counted, only named (E10). The totals are
// added up by the database over every open line (invoiceCostRepository.openReceivedTotals /
// openExpectedByShipment); here they are put together, and the lines listed are classified and sorted. A
// haulier's approved Trucking invoices not yet paid are summed apart: they are with VAT (C-1, C-9). Pure.

import { round2, qtyOrOne, toNumber } from "./invoiceCalc";
import { addDays, businessDay } from "../../../lib/businessDate";
import type {
  SupplierCostLine,
  SupplierCostsResponse,
  SupplierCostTotal,
  SupplierHaulierInvoiceLine,
  SupplierHaulierInvoices,
  SupplierHaulierInvoiceTotal,
  SupplierTypedName,
} from "../interfaces/interfaces";

/**
 * Whether the caller sees a haulier's Trucking invoices: the Trucking Concept is for superadmins only, as the web
 * shows it (apps/web/src/lib/concepts.ts canSeeConcepts), so the server leaves them out for everyone else (C-1).
 */
export const seesTruckingConcept = (role: string): boolean => role === "superadmin";

export interface SupplierCostRow {
  id: string;
  shipmentId: string;
  category: string;
  description: string;
  invoiceNumber: string;
  received: boolean;
  receivedAt: Date | null;
  estQty: string | null;
  estAmount: string | null;
  estCurrency: string;
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
}

export interface SupplierCostJob {
  jobNumber: string;
  status: string;
}

/** A job no cost is expected on any more: its estimates are not expected. */
export const CANCELLED_STATUS = "Cancelled Shipment";

/** Whether what is expected on a job counts: the job is there and not cancelled. */
export const expectsCosts = (job: SupplierCostJob | undefined): boolean => !!job && job.status !== CANCELLED_STATUS;

const amountOf = (amount: string | null, qty: string | null): number => round2(toNumber(amount) * qtyOrOne(qty));

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * The line as "What we owe" shows it, or null when it shows nothing: its job is gone, or it is only
 * expected with no amount, or on a cancelled job. A received line stays, with no amount when its
 * real cost was not typed (it is owed all the same).
 */
export function supplierCostLine(row: SupplierCostRow, job: SupplierCostJob | undefined, paymentDays: number | null, today: string): SupplierCostLine | null {
  if (!job) return null;
  const base = {
    id: row.id,
    shipmentId: row.shipmentId,
    jobNumber: job.jobNumber,
    category: row.category,
    description: row.description,
    invoiceNumber: row.invoiceNumber,
  };
  if (row.received) {
    const receivedOn = row.receivedAt ? businessDay(row.receivedAt) : "";
    const dueOn = receivedOn && paymentDays !== null ? addDays(receivedOn, paymentDays) : "";
    return {
      ...base,
      kind: row.receivedAt ? "owed" : "untracked",
      receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
      dueOn,
      overdueDays: dueOn && dueOn < today ? daysBetween(dueOn, today) : 0,
      amount: row.realAmount === null ? null : amountOf(row.realAmount, row.realQty),
      currency: row.realCurrency,
    };
  }
  if (job.status === CANCELLED_STATUS) return null;
  const real = row.realAmount === null ? null : amountOf(row.realAmount, row.realQty);
  const amount = real ?? (row.estAmount === null ? null : amountOf(row.estAmount, row.estQty));
  if (!amount) return null;
  return { ...base, kind: "expected", receivedAt: null, dueOn: "", overdueDays: 0, amount, currency: real !== null ? row.realCurrency : row.estCurrency };
}

/** A supplier's received open lines in one currency, as the database adds them over all of them. */
export interface ReceivedTotalsRow {
  currency: string;
  /** decimal sums: owed (since when is known), its part due before today, untracked (K2) */
  owed: string;
  overdue: string;
  untracked: string;
  owedLines: number;
  /** owed lines with no real cost typed */
  withoutAmount: number;
  untrackedLines: number;
  /** lines with a real cost typed: a currency with none has no total */
  withAmount: number;
}

/** A supplier's open lines not received yet on one job in one currency, as the database adds them. */
export interface ExpectedGroupRow {
  shipmentId: string;
  currency: string;
  amount: string;
  lines: number;
}

const byCurrency = <T extends { currency: string }>(totals: Map<string, T>, currency: string, blank: () => T): T => {
  let t = totals.get(currency);
  if (!t) totals.set(currency, (t = blank()));
  return t;
};

/**
 * Each currency's totals over every open line, and the counts: what is expected on a cancelled job, or on one
 * gone, is left out. Without payment days no owed line has a due day.
 */
export function supplierCostTotals(
  received: ReceivedTotalsRow[],
  expected: ExpectedGroupRow[],
  jobOf: ReadonlyMap<string, SupplierCostJob>,
  paymentDays: number | null,
): { totals: SupplierCostTotal[]; counts: SupplierCostsResponse["counts"] } {
  const totals = new Map<string, SupplierCostTotal>();
  const blank = (currency: string) => () => ({ currency, owed: 0, overdue: 0, expected: 0, untracked: 0 });
  const counts = { owed: 0, expected: 0, untracked: 0, withoutAmount: 0, dueUnknown: 0 };
  for (const r of received) {
    counts.owed += r.owedLines;
    counts.untracked += r.untrackedLines;
    counts.withoutAmount += r.withoutAmount;
    if (!r.withAmount) continue;
    const t = byCurrency(totals, r.currency, blank(r.currency));
    t.owed += toNumber(r.owed);
    t.overdue += toNumber(r.overdue);
    t.untracked += toNumber(r.untracked);
  }
  for (const g of expected) {
    if (!expectsCosts(jobOf.get(g.shipmentId))) continue;
    counts.expected += g.lines;
    byCurrency(totals, g.currency, blank(g.currency)).expected += toNumber(g.amount);
  }
  if (paymentDays === null) counts.dueUnknown = counts.owed;
  return {
    totals: [...totals.values()]
      .map((t) => ({ currency: t.currency, owed: round2(t.owed), overdue: round2(t.overdue), expected: round2(t.expected), untracked: round2(t.untracked) }))
      .sort((a, b) => b.owed - a.owed || b.expected - a.expected || a.currency.localeCompare(b.currency)),
    counts,
  };
}

// Most overdue first, then by due day (unknown last), then the oldest received.
const byUrgency = (a: SupplierCostLine, b: SupplierCostLine) =>
  b.overdueDays - a.overdueDays ||
  (a.dueOn || "9999").localeCompare(b.dueOn || "9999") ||
  (a.receivedAt ?? "").localeCompare(b.receivedAt ?? "") ||
  a.jobNumber.localeCompare(b.jobNumber);

// The newest job first (job numbers grow), then by the words.
const newestJobFirst = (a: SupplierCostLine, b: SupplierCostLine) => b.jobNumber.localeCompare(a.jobNumber) || a.description.localeCompare(b.description);

/** The lines listed, in their three lists: owed most urgent first, expected and untracked the newest job first. */
export function supplierCostLists(lines: SupplierCostLine[]): { owed: SupplierCostLine[]; expected: SupplierCostLine[]; untracked: SupplierCostLine[] } {
  return {
    owed: lines.filter((l) => l.kind === "owed").sort(byUrgency),
    expected: lines.filter((l) => l.kind === "expected").sort(newestJobFirst),
    untracked: lines.filter((l) => l.kind === "untracked").sort(newestJobFirst),
  };
}

/** A haulier's approved Trucking invoice not yet paid, as handed by Trucking. */
export interface UnpaidHaulierInvoiceRow {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  /** with VAT */
  totalGross: number;
  currency: string;
  paymentTracked: boolean;
}

/** The invoice as What we owe shows it: owed by its own due day, or, approved before payments were noted here, untracked (K2). */
export function haulierInvoiceLine(i: UnpaidHaulierInvoiceRow, today: string): SupplierHaulierInvoiceLine {
  const dueOn = i.dueDate ?? "";
  const kind = i.paymentTracked ? "owed" : "untracked";
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    kind,
    issueDate: i.issueDate,
    dueOn,
    overdueDays: kind === "owed" && dueOn && dueOn < today ? daysBetween(dueOn, today) : 0,
    amount: i.totalGross,
    currency: i.currency,
  };
}

/**
 * A haulier's unpaid invoices in What we owe: the most urgent owed and the newest untracked listed (at most
 * `shown` of each), the totals of each currency and the counts over all of them, with VAT.
 */
export function summarizeHaulierInvoices(
  invoices: UnpaidHaulierInvoiceRow[],
  today: string,
  shown: { owed: number; untracked: number },
): Omit<SupplierHaulierInvoices, "status" | "truncated"> {
  const lines = invoices.map((i) => haulierInvoiceLine(i, today));
  const owed = lines
    .filter((l) => l.kind === "owed")
    .sort((a, b) => b.overdueDays - a.overdueDays || (a.dueOn || "9999").localeCompare(b.dueOn || "9999") || a.issueDate.localeCompare(b.issueDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
  const untracked = lines.filter((l) => l.kind === "untracked").sort((a, b) => b.issueDate.localeCompare(a.issueDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
  const totals = new Map<string, SupplierHaulierInvoiceTotal>();
  for (const l of lines) {
    const t = byCurrency(totals, l.currency, () => ({ currency: l.currency, owed: 0, overdue: 0, untracked: 0 }));
    if (l.kind === "untracked") t.untracked += l.amount;
    else {
      t.owed += l.amount;
      if (l.overdueDays > 0) t.overdue += l.amount;
    }
  }
  return {
    owed: owed.slice(0, shown.owed),
    untracked: untracked.slice(0, shown.untracked),
    totals: [...totals.values()]
      .map((t) => ({ currency: t.currency, owed: round2(t.owed), overdue: round2(t.overdue), untracked: round2(t.untracked) }))
      .sort((a, b) => b.owed - a.owed || a.currency.localeCompare(b.currency)),
    counts: { owed: owed.length, untracked: untracked.length, dueUnknown: owed.filter((l) => !l.dueOn).length },
  };
}

// Legal forms left out when a typed name is compared with the company's ("Maersk" names "Maersk A/S").
const LEGAL_FORMS = new Set([
  "sro", "spol", "as", "vos", "ks", "zs", "se", "gmbh", "ag", "kg", "co", "ohg", "ug", "mbh",
  "ltd", "limited", "llc", "llp", "inc", "corp", "plc", "bv", "nv", "sa", "sas", "sarl", "srl",
  "spa", "sp", "zoo", "kft", "oy", "ab", "aps", "doo", "sl", "lda", "bvba",
  // the parts of a form typed with spaces: "spol. s r. o.", "a. s.", "sp. z o.o."
  "a", "s", "r", "o", "ro", "z", "oo",
]);

/** A company name as typed names are matched to it: no case, accents, punctuation or legal form. */
export function nameKey(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "s.r.o." and "A/S" are one word each once their dots and slashes go.
    .replace(/(\b\w)[./](?=\w\b)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length > 1 && LEGAL_FORMS.has(words[words.length - 1]!)) words.pop();
  return words.join(" ");
}

/** The typed vendor texts that name the company, with their counts, most lines first. */
export function typedNamesOf(groups: { vendor: string; lines: number }[], companyName: string): SupplierTypedName[] {
  const key = nameKey(companyName);
  if (!key) return [];
  const byText = new Map<string, number>();
  for (const g of groups) {
    const text = g.vendor.trim();
    if (!text || nameKey(text) !== key) continue;
    byText.set(text, (byText.get(text) ?? 0) + g.lines);
  }
  return [...byText].map(([vendor, lines]) => ({ vendor, lines })).sort((a, b) => b.lines - a.lines || a.vendor.localeCompare(b.vendor));
}
