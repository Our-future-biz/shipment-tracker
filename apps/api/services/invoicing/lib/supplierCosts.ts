// A supplier's open buying cost lines, as "What we owe" on its page shows them (Council Outlay 7,
// step 6b): what was received and is not paid is owed (its real cost), what is not received yet is
// expected (the real cost once typed, else the estimate) and never part of the owed total (E9).
// Lines whose vendor only names the supplier as typed text are not counted, only named (E10). Pure.

import { round2, qtyOrOne, toNumber } from "./invoiceCalc";
import type { SupplierCostLine, SupplierTypedName } from "../interfaces/interfaces";

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

/**
 * The line as "What we owe" shows it, or null when it shows nothing: its job is gone, or it is only
 * expected with no amount, or on a cancelled job. A received line stays, with no amount when its
 * real cost was not typed (it is owed all the same).
 */
export function supplierCostLine(row: SupplierCostRow, job: SupplierCostJob | undefined): SupplierCostLine | null {
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
    return {
      ...base,
      received: true,
      receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
      amount: row.realAmount === null ? null : amountOf(row.realAmount, row.realQty),
      currency: row.realCurrency,
    };
  }
  if (job.status === CANCELLED_STATUS) return null;
  const real = row.realAmount === null ? null : amountOf(row.realAmount, row.realQty);
  const amount = real ?? (row.estAmount === null ? null : amountOf(row.estAmount, row.estQty));
  if (!amount) return null;
  return { ...base, received: false, receivedAt: null, amount, currency: real !== null ? row.realCurrency : row.estCurrency };
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
