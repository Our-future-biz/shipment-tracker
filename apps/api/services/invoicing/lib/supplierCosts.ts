// A supplier's open buying cost lines, as "What we owe" on its page shows them (Council Outlay 7,
// step 6b, and Council Review 5):
//  - owed: received and not paid, its real cost; due its received day (Prague) + the supplier's payment
//    days, overdue once that day is past
//  - expected: not received yet (the real cost once typed, else the estimate); never in the owed total (E9)
//  - untracked: ticked Received before that day was kept, before payments were noted here, so it may have
//    been paid already: listed apart, not counted (K2)
// Lines whose vendor only names the supplier as typed text are not counted, only named (E10). Pure.

import { round2, qtyOrOne, toNumber } from "./invoiceCalc";
import { addDays, businessDay } from "../../../lib/businessDate";
import type { SupplierCostLine, SupplierCostTotal, SupplierTypedName } from "../interfaces/interfaces";

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

export interface SupplierCostsSummary {
  owed: SupplierCostLine[];
  expected: SupplierCostLine[];
  untracked: SupplierCostLine[];
  totals: SupplierCostTotal[];
  withoutAmount: number;
  dueUnknown: number;
}

// Most overdue first, then by due day (unknown last), then the oldest received.
const byUrgency = (a: SupplierCostLine, b: SupplierCostLine) =>
  b.overdueDays - a.overdueDays ||
  (a.dueOn || "9999").localeCompare(b.dueOn || "9999") ||
  (a.receivedAt ?? "").localeCompare(b.receivedAt ?? "") ||
  a.jobNumber.localeCompare(b.jobNumber);

/** The lines in their three lists (owed most urgent first), and the totals of each currency over all of them. */
export function summarizeSupplierCosts(lines: SupplierCostLine[]): SupplierCostsSummary {
  const totals = new Map<string, SupplierCostTotal>();
  const totalOf = (currency: string) => {
    let t = totals.get(currency);
    if (!t) totals.set(currency, (t = { currency, owed: 0, overdue: 0, expected: 0, untracked: 0 }));
    return t;
  };
  for (const l of lines) {
    if (l.amount === null) continue;
    const t = totalOf(l.currency);
    if (l.kind === "owed") {
      t.owed += l.amount;
      if (l.overdueDays > 0) t.overdue += l.amount;
    } else {
      t[l.kind] += l.amount;
    }
  }
  const owed = lines.filter((l) => l.kind === "owed").sort(byUrgency);
  const newestFirst = (a: SupplierCostLine, b: SupplierCostLine) => b.jobNumber.localeCompare(a.jobNumber) || a.description.localeCompare(b.description);
  return {
    owed,
    expected: lines.filter((l) => l.kind === "expected").sort(newestFirst),
    untracked: lines.filter((l) => l.kind === "untracked").sort(newestFirst),
    totals: [...totals.values()]
      .map((t) => ({ currency: t.currency, owed: round2(t.owed), overdue: round2(t.overdue), expected: round2(t.expected), untracked: round2(t.untracked) }))
      .sort((a, b) => b.owed - a.owed || b.expected - a.expected || a.currency.localeCompare(b.currency)),
    withoutAmount: owed.filter((l) => l.amount === null).length,
    dueUnknown: owed.filter((l) => !l.dueOn).length,
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
