import { chargeLabel, toChargeCode } from "../../../lib/chargeCodes";
import { splitCents } from "./costSplit";

// An invoice read line by line: a line whose B/L names a shipment goes to that shipment, any other
// is shared out over the shipments given, and each shipment gets one buying row per charge and
// currency. Pure, so the sums have their test.

export interface InvoicePostLine {
  category: string;
  /** a decimal string; a credit is negative */
  amount: string;
  currency: string;
  /** the charge as the invoice prints it */
  item?: string;
  /** the B/L the line names, as read */
  bl?: string;
  /** the shipment its B/L names, or the one a person chose */
  shipmentId?: string;
  /** shipmentId was chosen by a person, not by the line's B/L */
  chosen?: boolean;
  /** otherwise: the shipments it is shared out over, by weight */
  split?: { shipmentId: string; weight: number }[];
}

/** One buying row an invoice comes to. */
export interface InvoicePostRow {
  shipmentId: string;
  category: string;
  /** "399.60" */
  amount: string;
  currency: string;
  description: string;
}

/** A shipment of the master job an invoice is for, as the shipments service has it. */
export interface InvoiceHouse {
  shipmentId: string;
  jobNumber: string;
  /** may hold more than one number ("A1, B2") */
  houseBolNumber: string;
  cancelled: boolean;
  /** W/M */
  freightTon: number;
}

/** How a line going to the split is shared out: by each shipment's W/M, or the same part for each. */
export type InvoiceSplitMethod = "wm" | "shipment";

// The most a numeric(14,2) column holds, in cents.
const MAX_CENTS = 99_999_999_999_999;

const centsOf = (amount: string) => Math.round(Number(amount) * 100);
const labelOf = (line: Pick<InvoicePostLine, "item" | "category">) => line.item?.trim() || line.category || "A line";

/** A B/L as compared: capitals, without spaces or punctuation (as the screens compare it). */
const blKey = (bl: string | undefined) => (bl ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// A shipment's field may hold more than one number ("A1, B2").
const blKeysOf = (field: string) => field.split(/[,;]+/).map(blKey).filter(Boolean);

/** An invoice number as compared for a repeat: without spaces, in capitals ("as 2607 07595" is AS260707595). */
export const invoiceNumberKey = (invoiceNumber: string): string => invoiceNumber.replace(/\s+/g, "").toUpperCase();

/** Why this line can't be posted, or null. Its amount is a decimal of at most 2 places by now (toDecimal). */
export function invoiceLineProblem(line: InvoicePostLine): string | null {
  const cents = centsOf(line.amount);
  const label = labelOf(line);
  if (!line.amount.trim() || !Number.isFinite(cents) || cents === 0) return `${label}: the amount must be a number other than 0`;
  if (!toChargeCode(line.category)) return `${label}: choose a charge`;
  if (!line.currency.trim()) return `${label}: the currency is missing`;
  if (line.shipmentId) return null;
  const weights = (line.split ?? []).map((s) => s.weight);
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) return `${label}: a weight must be a number of at least 0`;
  return weights.some((w) => w > 0) ? null : `${label}: no shipment to split it over`;
}

/**
 * The lines of an invoice for a master job, placed on its shipments as the server has them, or why
 * one can't be. Each shipment a line goes to must be a live, not cancelled, shipment of the master
 * job. A line placed by its B/L must name that shipment's House B/L; one a person sent to a shipment
 * only has to stay within the master job. A shared line is weighed here, by the master job's own
 * W/M or equally, whatever weights the browser sent.
 */
export function onMasterJob(
  lines: readonly InvoicePostLine[],
  houses: readonly InvoiceHouse[],
  splitMethod: InvoiceSplitMethod | undefined,
): { lines: InvoicePostLine[] } | { problem: string } {
  const byId = new Map(houses.map((h) => [h.shipmentId, h]));
  // The shipment a line may go to, or why not.
  const houseFor = (label: string, shipmentId: string): InvoiceHouse | string => {
    const house = byId.get(shipmentId);
    if (!house) return `${label}: that shipment is not on this master job`;
    if (house.cancelled) return `${label}: ${house.jobNumber} is cancelled, so nothing is posted to it`;
    return house;
  };
  const placed: InvoicePostLine[] = [];
  for (const line of lines) {
    const label = labelOf(line);
    if (line.shipmentId) {
      const house = houseFor(label, line.shipmentId);
      if (typeof house === "string") return { problem: house };
      if (!line.chosen && !blKeysOf(house.houseBolNumber).includes(blKey(line.bl))) {
        const bl = line.bl?.trim();
        return { problem: `${label}: ${bl ? `${bl} is not the House B/L of ${house.jobNumber}` : `it names no B/L of ${house.jobNumber}`}; choose the shipment for it` };
      }
      placed.push({ ...line, split: undefined });
      continue;
    }
    const split = line.split ?? [];
    if (!split.length) {
      placed.push(line);
      continue;
    }
    if (!splitMethod) return { problem: `${label}: choose how to split it` };
    if (new Set(split.map((s) => s.shipmentId)).size !== split.length) return { problem: `${label}: a shipment is listed twice in its split` };
    const weighed: { shipmentId: string; weight: number }[] = [];
    for (const s of split) {
      const house = houseFor(label, s.shipmentId);
      if (typeof house === "string") return { problem: house };
      weighed.push({ shipmentId: s.shipmentId, weight: splitMethod === "wm" ? Math.max(house.freightTon, 0) : 1 });
    }
    if (!weighed.some((s) => s.weight > 0)) return { problem: `${label}: none of the shipments it is split over has a W/M` };
    placed.push({ ...line, split: weighed });
  }
  return { lines: placed };
}

/** A buying row's description on a credit note, which the row must say as well as its minus. */
function creditDescription(items: string[]): string {
  const text = items.join(", ");
  if (!text) return "Credit note";
  return /^credit note/i.test(text) ? text : `Credit note: ${text}`;
}

/**
 * The rows the lines come to, in the order the shipments and charges first appear. A shared line
 * adds up to its amount to the cent; a row that comes to nothing (a charge and its credit) is left out.
 */
export function invoiceRows(lines: InvoicePostLine[], opts: { creditNote?: boolean } = {}): InvoicePostRow[] {
  const rows = new Map<string, { shipmentId: string; category: string; cents: number; currency: string; items: string[] }>();
  const add = (shipmentId: string, line: InvoicePostLine, cents: number) => {
    if (cents === 0) return;
    const category = toChargeCode(line.category);
    const currency = line.currency.trim().toUpperCase();
    const key = `${shipmentId} ${category} ${currency}`;
    const row = rows.get(key) ?? { shipmentId, category, cents: 0, currency, items: [] };
    row.cents += cents;
    const item = line.item?.trim();
    if (item && !row.items.includes(item)) row.items.push(item);
    rows.set(key, row);
  };
  for (const line of lines) {
    const cents = centsOf(line.amount);
    if (line.shipmentId) {
      add(line.shipmentId, line, cents);
      continue;
    }
    const split = line.split ?? [];
    const parts = splitCents(cents, split.map((s) => s.weight));
    split.forEach((s, i) => add(s.shipmentId, line, parts[i]!));
  }
  return [...rows.values()]
    .filter((r) => r.cents !== 0)
    .map((r) => ({ shipmentId: r.shipmentId, category: r.category, amount: (r.cents / 100).toFixed(2), currency: r.currency, description: opts.creditNote ? creditDescription(r.items) : r.items.join(", ") }));
}

/**
 * Why these rows can't be posted, or null: there are none (the lines cancel out), one is more than an
 * amount can hold, or - on a credit note, which deducts - one comes to more than 0. A charge printed
 * among a credit note's credits is fine while its row stays a deduction.
 */
export function invoiceRowsProblem(rows: readonly InvoicePostRow[], opts: { creditNote?: boolean } = {}): string | null {
  if (!rows.length) return "The lines come to nothing: there is no buying row to post";
  const big = rows.find((r) => Math.abs(centsOf(r.amount)) > MAX_CENTS);
  if (big) return `${chargeLabel(big.category)}: ${big.amount} ${big.currency} is more than an amount can hold`;
  const plus = opts.creditNote ? rows.find((r) => centsOf(r.amount) > 0) : undefined;
  if (plus) return `A credit note deducts: ${chargeLabel(plus.category)} would come to +${plus.amount} ${plus.currency} on a shipment`;
  return null;
}

/** A live row of the shipment that an invoice's real cost can go onto: an estimate with no real cost and no invoice number yet. */
export interface OpenEstimateRow {
  id: string;
  shipmentId: string;
  category: string;
}

/**
 * For each row, the open estimate row of its shipment and charge it goes onto, or null for a new
 * row: the real cost lands on the estimate it belongs to, so the two aren't counted side by side.
 * `open` comes in the order Costs Breakdown lists them, and each takes one row at most.
 */
export function ontoEstimates(rows: readonly Pick<InvoicePostRow, "shipmentId" | "category">[], open: readonly OpenEstimateRow[]): (string | null)[] {
  const used = new Set<string>();
  return rows.map((row) => {
    const estimate = open.find((o) => !used.has(o.id) && o.shipmentId === row.shipmentId && o.category === row.category);
    if (!estimate) return null;
    used.add(estimate.id);
    return estimate.id;
  });
}
